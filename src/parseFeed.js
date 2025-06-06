const puppeteer = require('puppeteer');
const axios = require('axios'); // Nadal potrzebujemy axios do drugiego zapytania

// URL głównej strony Flashscore
const flashscoreUrl = 'https://www.flashscore.pl/';
// URL znalezionego API
const apiUrl = 'https://3.flashscore.ninja/3/x/feed/f_1_1_2_pl_1';

// Funkcje parseField i parseRecord pozostają takie same jak poprzednio
function parseField(fieldString) {
    const parts = fieldString.split('÷');
    if (parts.length === 2) { return { code: parts[0], value: parts[1] }; }
    return null;
}
function parseRecord(recordString) {
    const fields = recordString.split('¬');
    const recordData = {};
    fields.forEach(field => {
        const parsed = parseField(field);
        if (parsed) { recordData[parsed.code] = parsed.value; }
    });
    return recordData;
}

// Główna funkcja scrapująca (teraz w dwóch etapach)
async function fetchFlashscoreDataWithAuth() {
    let browser; // Zdefiniuj browser na zewnątrz try, aby użyć w finally
    try {
        console.log('Etap 1: Uruchamianie przeglądarki i pobieranie x-fsign...');
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);

        await page.goto(flashscoreUrl, { waitUntil: 'networkidle0' }); // Poczekaj na pełne załadowanie

        // Wyciągnij wartość x-fsign z kontekstu strony
        // Flashscore może przechowywać ją w różny sposób, np. w globalnym obiekcie window
        // Poniższy kod próbuje znaleźć zmienną `window.config.global.cs.SIGN` lub `window.environment.sign`
        // Może być konieczne zbadanie kodu źródłowego flashscore.pl, aby znaleźć dokładną lokalizację!
        const fsign = await page.evaluate(() => {
            // Spróbuj różnych potencjalnych lokalizacji - dostosuj w razie potrzeby!
            if (typeof window !== 'undefined' && window.config && window.config.global && window.config.global.cs && window.config.global.cs.SIGN) {
                return window.config.global.cs.SIGN;
            }
            if (typeof window !== 'undefined' && window.environment && window.environment.sign) {
                return window.environment.sign;
            }
             // W ostateczności przeszukaj skrypty (wolniejsze)
             let foundSign = null;
             const scripts = document.querySelectorAll('script');
             for (const script of scripts) {
                 if (script.textContent) {
                     // Proste wyrażenie regularne - może wymagać ulepszenia
                     const match = script.textContent.match(/;\s*fsign\s*=\s*['"]([^'"]+)['"]/);
                     if (match && match[1]) {
                         foundSign = match[1];
                         break;
                     }
                 }
             }
             return foundSign; // Zwraca znaleziony fsign lub null
        });

        // Zamknij przeglądarkę Puppeteer, już jej nie potrzebujemy do tego kroku
        await browser.close();
        browser = null; // Ustaw na null, aby nie próbować zamykać ponownie w finally

        if (!fsign) {
            throw new Error('Nie udało się znaleźć wartości x-fsign na stronie flashscore.pl. Lokalizacja mogła się zmienić.');
        }

        console.log(`Pobrano x-fsign: ${fsign.substring(0, 10)}...`); // Wyświetl tylko początek dla bezpieczeństwa

        // --- Etap 2: Pobieranie danych z API z użyciem x-fsign ---
        console.log(`Pobieranie danych z ${apiUrl} z nagłówkiem x-fsign...`);
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': flashscoreUrl, // Dodaj Referer
                'X-Requested-With': 'XMLHttpRequest', // Często potrzebne przy XHR
                'x-fsign': fsign // <<< KLUCZOWY NAGŁÓWEK!
            }
        });

        const feedData = response.data;
        console.log('Dane API pobrane. Rozpoczynanie parsowania...');

        // Parsowanie danych (logika pozostaje taka sama jak poprzednio)
        const records = feedData.split('~');
        const allMatches = [];
        let currentLeague = 'N/A';
        records.forEach(recordStr => {
             if (!recordStr.trim()) return;
             const record = parseRecord(recordStr);
             if (record.ZA) { currentLeague = record.ZA; }
             else if (record.AA && record.AE && record.AF) {
                 const match = {
                     id: record.AA, league: currentLeague,
                     timestamp: record.AD ? parseInt(record.AD, 10) : null,
                     homeTeam: record.AE, awayTeam: record.AF,
                     homeScore: record.AG, awayScore: record.AH,
                     statusId: record.AC, tvChannels: []
                 };
                 if (record.AL) {
                     try {
                         const liveInfo = JSON.parse(record.AL);
                         if (liveInfo && liveInfo["1"] && Array.isArray(liveInfo["1"])) {
                             liveInfo["1"].forEach(tvEntry => {
                                 if (tvEntry.BN) { match.tvChannels.push(tvEntry.BN); }
                             });
                         }
                     } catch (e) { /* Ignoruj błędy parsowania AL */ }
                 }
                 allMatches.push(match);
             }
         });

        console.log(`Parsowanie zakończone. Znaleziono ${allMatches.length} meczów.`);
        return allMatches;

    } catch (error) {
        console.error('Błąd podczas procesu:', error.message);
        if (error.response) { // Błąd z axios
            console.error('Status odpowiedzi API:', error.response.status);
        } else if (error.name === 'TimeoutError') { // Błąd z Puppeteer
             console.error('Timeout podczas ładowania strony lub wykonywania skryptu.');
        }
        // Dodatkowe logowanie dla błędów innych niż HTTP
        if (!error.response && error.config) { console.error('Błąd sieci lub konfiguracji Axios.'); }

        return [];
    } finally {
        // Upewnij się, że przeglądarka jest zamknięta, jeśli wystąpił błąd przed jej zamknięciem w try
        if (browser) {
            console.log('Zamykanie przeglądarki (w bloku finally)...');
            await browser.close();
        }
    }
}

// Uruchomienie i wyświetlenie wyników
fetchFlashscoreDataWithAuth().then(matches => {
    console.log("\n--- Wyniki Parsowania z API ---");
    if (matches.length > 0) {
        const polishTvKeywords = ['Polsat', 'Canal+', 'TVP', 'Eleven', 'Viaplay'];
        const matchesOnPolishTV = matches.filter(match =>
            match.tvChannels.some(channel =>
                polishTvKeywords.some(keyword => channel.includes(keyword))
            )
        );
        console.log(`\nZnaleziono ${matchesOnPolishTV.length} meczów z potencjalną transmisją w PL TV:`);
        console.log(JSON.stringify(matchesOnPolishTV, null, 2)); // Wyświetl tylko te z PL TV

        // console.log("\nPełna lista sparsowanych meczów (pierwsze 10):");
        // console.log(JSON.stringify(matches.slice(0, 10), null, 2));
    } else {
        console.log("Nie udało się sparsować żadnych meczów z API.");
    }
});