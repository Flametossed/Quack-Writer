// Spelling suggestions via the Windows Spell Checking API (ISpellChecker).
//
// WebView2 draws red squiggles using this same OS spellchecker, but its
// default context menu carries no suggestion items and exposes no JS API to
// query them. So the frontend renders its own context menu and asks these
// commands for suggestions — same engine, so results agree with the squiggles.

use serde::Serialize;

#[derive(Serialize)]
pub struct SpellCheckResult {
    pub misspelled: bool,
    pub suggestions: Vec<String>,
}

/// Check one word and return up to a handful of suggestions when misspelled.
#[tauri::command]
pub async fn spell_suggest(word: String) -> Result<SpellCheckResult, String> {
    tauri::async_runtime::spawn_blocking(move || imp::suggest(&word))
        .await
        .map_err(|e| e.to_string())?
}

/// Add a word to the user's Windows custom dictionary (shared with Edge and
/// the squiggle engine, though existing squiggles may not refresh until the
/// word is retyped).
#[tauri::command]
pub async fn spell_add_word(word: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || imp::add_word(&word))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod imp {
    use super::SpellCheckResult;
    use windows::core::PCWSTR;
    use windows::Win32::Globalization::{
        GetUserDefaultLocaleName, ISpellChecker, ISpellCheckerFactory, ISpellingError,
        SpellCheckerFactory,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Com::IEnumString;

    const MAX_SUGGESTIONS: usize = 8;

    /// Balances CoInitializeEx/CoUninitialize on the (reused) blocking thread.
    struct ComGuard;

    impl ComGuard {
        fn new() -> Result<Self, String> {
            // S_FALSE ("already initialized") is fine; a real failure such as
            // RPC_E_CHANGED_MODE surfaces as Err.
            unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
                .ok()
                .map_err(|e| e.to_string())?;
            Ok(ComGuard)
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn user_locale() -> String {
        let mut buf = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH
        let len = unsafe { GetUserDefaultLocaleName(&mut buf) };
        if len > 1 {
            String::from_utf16_lossy(&buf[..(len as usize - 1)])
        } else {
            "en-US".to_string()
        }
    }

    fn create_checker() -> Result<ISpellChecker, String> {
        let factory: ISpellCheckerFactory =
            unsafe { CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER) }
                .map_err(|e| e.to_string())?;
        let mut locale = to_wide(&user_locale());
        let supported = unsafe { factory.IsSupported(PCWSTR(locale.as_ptr())) }
            .map_err(|e| e.to_string())?;
        if !supported.as_bool() {
            locale = to_wide("en-US");
        }
        unsafe { factory.CreateSpellChecker(PCWSTR(locale.as_ptr())) }.map_err(|e| e.to_string())
    }

    fn collect_strings(list: &IEnumString, limit: usize) -> Vec<String> {
        let mut out = Vec::new();
        while out.len() < limit {
            let mut slot = [windows::core::PWSTR::null()];
            let mut fetched = 0u32;
            let hr = unsafe { list.Next(&mut slot, Some(&mut fetched)) };
            if hr.is_err() || fetched == 0 || slot[0].is_null() {
                break;
            }
            let pw = slot[0];
            if let Ok(s) = unsafe { pw.to_string() } {
                out.push(s);
            }
            unsafe { CoTaskMemFree(Some(pw.as_ptr() as *const _)) };
        }
        out
    }

    pub fn suggest(word: &str) -> Result<SpellCheckResult, String> {
        let _com = ComGuard::new()?;
        let checker = create_checker()?;
        let word_w = to_wide(word);

        // Check() yields an error enumerator; any entry means "misspelled".
        let errors = unsafe { checker.Check(PCWSTR(word_w.as_ptr())) }.map_err(|e| e.to_string())?;
        let mut first: Option<ISpellingError> = None;
        let misspelled = unsafe { errors.Next(&mut first) }.is_ok() && first.is_some();
        if !misspelled {
            return Ok(SpellCheckResult {
                misspelled: false,
                suggestions: Vec::new(),
            });
        }

        let suggestions = match unsafe { checker.Suggest(PCWSTR(word_w.as_ptr())) } {
            Ok(list) => collect_strings(&list, MAX_SUGGESTIONS),
            Err(_) => Vec::new(),
        };
        Ok(SpellCheckResult {
            misspelled: true,
            suggestions,
        })
    }

    pub fn add_word(word: &str) -> Result<(), String> {
        let _com = ComGuard::new()?;
        let checker = create_checker()?;
        let word_w = to_wide(word);
        unsafe { checker.Add(PCWSTR(word_w.as_ptr())) }.map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
mod imp {
    use super::SpellCheckResult;

    pub fn suggest(_word: &str) -> Result<SpellCheckResult, String> {
        Err("Spelling suggestions are only available on Windows".to_string())
    }

    pub fn add_word(_word: &str) -> Result<(), String> {
        Err("Spelling suggestions are only available on Windows".to_string())
    }
}
