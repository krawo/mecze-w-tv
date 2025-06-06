const puppeteer = require('puppeteer');

// Selektory
const TOOLTIP_SELECTOR = 'div.tooltip';
const MATCH_SELECTOR = 'div.event__match';
// Używamy bardziej precyzyjnego selektora dla ikony TV
const TV_ICON_SELECTOR = 'a.event__icon.event__icon--tv';

async function scrapeFlashscoreFirst10WithTVFix() {
    console.log('Uruchamianie przeglądarki...');
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000); // Zwiększony timeout

        console.log('Nawigacja do https://www.flashscore.pl/...');
        // Użyj networkidle0 dla większej pewności załadowania zasobów
        await page.goto('https://www.flashscore.pl/', { waitUntil: 'networkidle0' });

        console.log('Oczekiwanie na załadowanie meczów...');
        await page.waitForSelector(MATCH_SELECTOR, { timeout: 15000 }); // Czekaj na pierwszy mecz

        const matchElements = await page.$$(MATCH_SELECTOR);
        const enhancedMatchesData = [];

        // Ograniczenie do 10 pierwszych meczów na potrzeby debugowania
        const limit = Math.min(matchElements.length, 10);
        console.log(`Znaleziono ${matchElements.length} elementów meczów. Przetwarzanie pierwszych ${limit} (na potrzeby debugowania)...`);

        // Pętla ograniczona do 'limit'
        for (let i = 0; i < limit; i++) {
            const matchElement = matchElements[i];
            let basicData = null;

            try {
                 // --- POPRAWKA: Przywrócenie działających selektorów dla basicData ---
                 basicData = await matchElement.evaluate(el => {
                    // Selektory z poprzedniej, działającej wersji [1]
                    const homeTeamElement = el.querySelector('div.event__homeParticipant .wcl-name_3y6f5'); // Poprawiony selektor
                    const awayTeamElement = el.querySelector('div.event__awayParticipant .wcl-name_3y6f5'); // Poprawiony selektor
                    const homeScoreElement = el.querySelector('.event__score--home'); // Używa spana
                    const awayScoreElement = el.querySelector('.event__score--away'); // Używa spana
                    const timeElement = el.querySelector('.event__time');
                    const statusElement = el.querySelector('.event__stage--block'); // Dla statusu np. "Przełożony"
                    const matchId = el.id; // ID meczu (np. g_1_xxxxxxx)

                    const homeTeam = homeTeamElement ? homeTeamElement.innerText.trim() : null;
                    const awayTeam = awayTeamElement ? awayTeamElement.innerText.trim() : null;

                    // Jeśli nie udało się znaleźć kluczowych danych (nazw drużyn), pomiń ten mecz
                    if (!homeTeam || !awayTeam) {
                        console.error(`EVALUATE [Index ${i}]: Nie znaleziono homeTeam ('${homeTeam}') lub awayTeam ('${awayTeam}')`);
                        return null;
                    }

                    // Pobieranie statusu/czasu
                    let statusText = 'N/A';
                    if (timeElement) {
                        statusText = timeElement.innerText.trim();
                    } else if (statusElement) {
                        statusText = statusElement.innerText.trim();
                    }

                     // Pobieranie wyniku - obsłuż różne stany
                    let score = '-';
                     if (homeScoreElement && awayScoreElement) {
                         const homeScore = homeScoreElement.innerText.trim();
                         const awayScore = awayScoreElement.innerText.trim();
                         // Sprawdź czy score nie jest pusty, co może oznaczać, że mecz się jeszcze nie zaczął
                         if (homeScore !== '' && awayScore !== '') {
                           score = `${homeScore} - ${awayScore}`;
                         }
                     }

                    return {
                        id: matchId || `match_${i}`, // Użyj ID flashscore lub zastępczego
                        status: statusText,
                        homeTeam: homeTeam,
                        awayTeam: awayTeam,
                        score: score,
                    };
                });

                if (!basicData) {
                    // Logowanie błędu zostało przeniesione do evaluate dla lepszej diagnostyki
                    console.log(`[Index ${i}] Pominięto element - nie udało się pobrać podstawowych danych (szczegóły powyżej w logach EVALUATE).`);
                    continue; // Przejdź do następnego meczu
                }

            } catch (evalError) {
                 console.error(`[Index ${i}] Błąd podczas pobierania podstawowych danych: ${evalError.message}`);
                 continue; // Przejdź do następnego meczu w razie błędu
            }

            // --- Logika pobierania info o TV (DISPATCHEVENT MOUSEOVER/MOUSEOUT) ---
            let tvInfo = null;

            try {
                const tvIconElement = await matchElement.$(TV_ICON_SELECTOR);
                if (tvIconElement) {
                    // Nie przewijamy na razie, zobaczymy czy samo dispatchEvent wystarczy
                    console.log(`[Mecz ${basicData.id}] Znaleziono ikonę TV (${TV_ICON_SELECTOR}). Próba wywołania 'mouseover' przez dispatchEvent...`);
                    // --- ZMIANA: Użycie dispatchEvent('mouseover') ---
                    await tvIconElement.evaluate(el => {
                        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
                    });
                    console.log(`[Mecz ${basicData.id}] 'mouseover' event dispatched.`);

                    // Pauza po dispatchEvent - nadal może być potrzebna
                    console.log(`[Mecz ${basicData.id}] Pauza 200ms po dispatchEvent...`);
                    await new Promise(resolve => setTimeout(resolve, 200));

                    // Selektory (bez zmian)
                    const visibleTooltipSelector = 'div.tooltip:not([style*="display: none"])';
                    const generalContentSpanSelector = '> span > span';
                    const fullWaitForSelector = visibleTooltipSelector + ' ' + generalContentSpanSelector;
                    const channelLinkSelector = 'span.tooltip-broadcast a';

                    try {
                        console.log(`[Mecz ${basicData.id}] Oczekiwanie na tooltip z treścią (ogólny span po mouseover dispatch): ${fullWaitForSelector} (max 3s)...`);
                        await page.waitForSelector(fullWaitForSelector, { timeout: 3000 });
                        console.log(`[Mecz ${basicData.id}] Tooltip z treścią (ogólny span po mouseover dispatch) ${fullWaitForSelector} ZNALEZIONY.`);

                        // --- POCZĄTEK EVALUATE (OBSŁUGA WIELU KANAŁÓW + FILTROWANIE) ---
                        tvInfo = await page.evaluate((containerSel) => { // Usunięto linkSel, bo użyjemy querySelectorAll
                            const visibleTooltipContainer = document.querySelector(containerSel);
                            if (!visibleTooltipContainer) {
                                console.log(`EVALUATE: Nie znaleziono widocznego KONTENERA tooltipa za pomocą selektora: ${containerSel}`);
                                return 'Błąd EVALUATE: Kontener tooltipa nie znaleziony';
                            }
                            console.log('EVALUATE: Znaleziono kontener tooltipa.');

                            // Znajdź WSZYSTKIE linki kanałów (tylko te w tooltip-broadcast)
                            const channelLinkSelector = 'span.tooltip-broadcast a';
                            const channelLinkElements = visibleTooltipContainer.querySelectorAll(channelLinkSelector);

                            if (channelLinkElements.length === 0) {
                                // Nie znaleziono ŻADNYCH linków w span.tooltip-broadcast
                                console.log(`EVALUATE: Nie znaleziono ŻADNYCH elementów linków kanałów (${channelLinkSelector}). Sprawdzanie, czy są tylko loga bukmacherów...`);
                                // Sprawdźmy, czy są linki bukmacherów, aby to potwierdzić (opcjonalne)
                                const logoLinks = visibleTooltipContainer.querySelectorAll('span.tooltip-logo a');
                                if (logoLinks.length > 0) {
                                     console.log(`EVALUATE: Znaleziono ${logoLinks.length} linków logo bukmacherów. Zwracam null (ignorujemy).`);
                                     return null; // Ignorujemy, jeśli są tylko loga
                                } else {
                                     console.log(`EVALUATE: Nie znaleziono ani linków kanałów, ani linków logo. Zwracam null.`);
                                     return null; // Zwróć null, jeśli tooltip jest pusty lub ma inną strukturę
                                }
                            }

                            // Znaleziono co najmniej jeden link kanału - zbierz ich tytuły
                            const channels = [];
                            console.log(`EVALUATE: Znaleziono ${channelLinkElements.length} potencjalnych linków kanałów. Przetwarzanie...`);
                            channelLinkElements.forEach(linkElement => {
                                const channelName = linkElement.getAttribute('title');
                                if (channelName && channelName.trim()) {
                                    // Dodaj tylko jeśli title istnieje i nie jest pusty
                                    channels.push(channelName.trim());
                                    console.log(`EVALUATE: Dodano kanał: "${channelName.trim()}"`);
                                } else {
                                    console.log(`EVALUATE: Pominięto link bez atrybutu 'title' lub pusty title: ${linkElement.outerHTML}`);
                                }
                            });

                            if (channels.length > 0) {
                                // Zwróć połączoną listę kanałów
                                const result = channels.join(', ');
                                console.log(`EVALUATE: Zwracam połączone kanały: "${result}"`);
                                return result;
                            } else {
                                // Znaleziono linki, ale żaden nie miał poprawnego title
                                console.log("EVALUATE: Znaleziono linki, ale żaden nie miał poprawnego atrybutu 'title'. Zwracam null.");
                                return null;
                            }

                        }, visibleTooltipSelector); // Przekazuj tylko selektor kontenera
                        // --- KONIEC EVALUATE ---

                        console.log(`[Mecz ${basicData.id}] Wynik z evaluate dla tooltipa: ${tvInfo}`);

                    } catch (waitError) {
                         console.error(`[Mecz ${basicData.id}] BŁĄD: Tooltip z treścią (ogólny span po mouseover dispatch) (${fullWaitForSelector}) nie pojawił się w ciągu 3 sekund.`);
                         console.error(waitError.message.split('\n')[0]);
                         tvInfo = 'Błąd: Tooltip nie załadował treści (po mouseover dispatch)';
                         const didTooltipExist = await page.evaluate(() => !!document.querySelector('div.tooltip'));
                         console.log(`[Mecz ${basicData.id}] Czy element 'div.tooltip' w ogóle istniał w DOM w momencie błędu? ${didTooltipExist}`);
                         const isContainerVisible = await page.evaluate((sel) => !!document.querySelector(sel), visibleTooltipSelector);
                         console.log(`[Mecz ${basicData.id}] Czy sam kontener (${visibleTooltipSelector}) był widoczny w momencie błędu? ${isContainerVisible}`);
                    }

                    // --- ZAMYKANIE: Dispatch mouseout + Czekaj na zniknięcie ---
                    console.log(`[Mecz ${basicData.id}] Próba zamknięcia tooltipa przez dispatchEvent('mouseout')...`);
                    try {
                        // Wywołaj 'mouseout' na ikonie TV, aby zasymulować odsunięcie myszy
                         await tvIconElement.evaluate(el => {
                            el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window }));
                         });
                         console.log(`[Mecz ${basicData.id}] 'mouseout' event dispatched.`);
                         // Daj chwilę na reakcję JS strony
                         await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (dispatchError) {
                        console.warn(`[Mecz ${basicData.id}] Ostrzeżenie podczas dispatchEvent('mouseout'): ${dispatchError.message.split('\n')[0]}`);
                    }

                    console.log(`[Mecz ${basicData.id}] Czekanie aż tooltip ${visibleTooltipSelector} zniknie (max 2s)...`);
                    try {
                        await page.waitForFunction(
                            (selector) => !document.querySelector(selector),
                            { timeout: 2000 },
                            visibleTooltipSelector
                        );
                        console.log(`[Mecz ${basicData.id}] Tooltip wydaje się być zamknięty.`);
                    } catch(closeError) {
                        console.warn(`[Mecz ${basicData.id}] OSTRZEŻENIE: Tooltip nie zniknął w ciągu 2 sekund po próbie mouseout.`);
                        // Nie robimy fallbacku na click, bo powodował nawigację
                    }

                } else { /* Brak ikony TV */ }
            } catch (error) {
                // Sprawdź, czy błąd to nie jest przypadkiem nawigacja
                 if (error.message.includes('Execution context was destroyed') || error.message.includes('Target closed')) {
                     console.error(`[Mecz ${basicData.id}] KRYTYCZNY BŁĄD: Wykryto nawigację lub zamknięcie strony podczas przetwarzania TV info! Przerywanie przetwarzania tego meczu.`);
                     tvInfo = 'Błąd KRYTYCZNY: Nawigacja strony';
                     // Tutaj można by rozważyć rzucenie błędu, aby zatrzymać całą pętlę, jeśli nawigacja psuje wszystko
                     // throw error; // Odkomentuj, jeśli chcesz zatrzymać skrypt po pierwszym błędzie nawigacji
                 } else {
                    console.error(`[Mecz ${basicData.id}] Nieoczekiwany BŁĄD podczas przetwarzania informacji TV: ${error.message}`);
                    tvInfo = 'Błąd: Przetwarzanie TV info';
                 }
                 // Próba zamknięcia tooltipa nawet po błędzie (jeśli kontekst nie został zniszczony)
                 try {
                    if (!error.message.includes('Execution context was destroyed')) {
                      await page.waitForFunction( (selector) => !document.querySelector(selector), { timeout: 500 }, 'div.tooltip:not([style*="display: none"])');
                    }
                 } catch(e){}
            }

            // Dodaj zebrane dane
            enhancedMatchesData.push({ ...basicData, tvInfo: tvInfo });

            // --- DODATKOWE ZABEZPIECZENIE: Sprawdź, czy strona nadal jest na flashscore ---
            // Można to dodać na końcu pętli for, aby wykryć nawigację przed następną iteracją
            // const currentUrl = page.url();
            // if (!currentUrl.includes('flashscore.pl')) {
            //     console.error(`FATAL: Wykryto nawigację poza flashscore.pl! URL: ${currentUrl}. Przerywanie pętli.`);
            //     break; // Wyjdź z pętli for
            // }

        } // Koniec pętli for

        console.log(`\nZakończono przetwarzanie ${enhancedMatchesData.length} meczów.`);
        return enhancedMatchesData;

    } catch (error) {
        console.error('Wystąpił główny błąd podczas scrapowania:', error);
        return [];
    } finally {
        if (browser) {
            console.log('Zamykanie przeglądarki...');
            await browser.close();
        } else {
            console.log('Przeglądarka nie została uruchomiona lub już zamknięta.');
        }
    }
}

scrapeFlashscoreFirst10WithTVFix().then(data => {
    console.log("\n--- Zebrane dane z pierwszych max 10 meczów (Poprawione selektory + TV info) ---");
    if (data.length > 0) {
        console.log(JSON.stringify(data, null, 2));
    } else {
        console.log("Nie udało się pobrać danych lub nie znaleziono meczów spełniających kryteria.");
    }
}).catch(err => {
    console.error("Błąd wykonania skryptu:", err);
});