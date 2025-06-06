const https = require('https');
const XmlStream = require('xml-stream');
const axios = require('axios');

const epgUrl = 'https://epg.ovh/pl.xml';

// Słowa kluczowe do identyfikacji meczów piłkarskich (bardziej precyzyjne)
const footballKeywords = [
    'piłka nożna', // Dodaj więcej lig/pucharów
    // Można rozważyć dodanie '-' np. 'Odra Opole - Wisła Kraków' lub nazw drużyn
];

// Słowa kluczowe do ODRZUCANIA programów
const negativeKeywords = [
    'magazyn', 'skróty', 'highlights', 'studio', 'przed meczem', 'po meczu',
    'ręczna', 'siatkówka', 'koszykówka', 'tenis', 'żużel', 'boks', 'mma',
    'lekkoatletyka', 'golf', 'wyścigi', 'formuła 1', 'polska z góry', 'wstęp do meczu',
    // Dodaj inne słowa, które powodują fałszywe alarmy
];

// Mapowanie ID kanału na nazwę (wypełnimy na początku)
const channels = {};

// Funkcja do czyszczenia nazwy kanału
function cleanChannelName(name) {
    if (!name) return 'N/A';
    // Usuń typowe prefiksy i dodatkowe spacje
    return name.replace(/^(PL[:|]\s*|HD|FHD|SD|4K|UHD)/i, '').trim();
}

async function processEpg() {
    console.log(`Rozpoczynanie pobierania i parsowania EPG z ${epgUrl}...`);

    try {
        const response = await axios({
            method: 'get', url: epgUrl, responseType: 'stream'
        });
        const stream = response.data;
        const xml = new XmlStream(stream);
        let channelCount = 0;
        let programCount = 0;

        // 1. Zbierz informacje o kanałach (ID -> Nazwa)
        xml.on('endElement: channel', function(item) {
            // Sprawdź czy struktura jest zgodna z oczekiwaniami i pobierz $text
            if (item?.$?.id && item['display-name']?.$text) {
                // Zapisz od razu wyczyszczoną nazwę kanału
                channels[item.$.id] = cleanChannelName(item['display-name'].$text);
                channelCount++;
            } else if (item?.$?.id && typeof item['display-name'] === 'string') {
                // Czasami nazwa może być bezpośrednio stringiem
                channels[item.$.id] = cleanChannelName(item['display-name']);
                 channelCount++;
            }
        });

        // 2. Przetwarzaj programy strumieniowo
        const foundMatches = [];
        xml.on('endElement: programme', function(item) {
            programCount++; // Licznik przetworzonych programów
            try {
                // Bezpieczne pobieranie danych za pomocą optional chaining (?.)
                const title = item.title?.$text?.toLowerCase() || '';
                const desc = item.desc?.$text?.toLowerCase() || '';
                const channelId = item.$?.channel;
                const start = item.$?.start;
                const stop = item.$?.stop;

                // Szybkie odrzucenie, jeśli brakuje podstawowych danych
                if (!channelId || !start || !stop || !title) {
                    return;
                }

                // Sprawdź negatywne słowa kluczowe NAJPIERW
                const hasNegativeKeyword = negativeKeywords.some(keyword =>
                    title.includes(keyword) || desc.includes(keyword)
                );
                if (hasNegativeKeyword) {
                    return; // Odrzuć program, jeśli zawiera negatywne słowo
                }

                // Sprawdź pozytywne słowa kluczowe
                const isFootball = footballKeywords.some(keyword =>
                    title.includes(keyword) || desc.includes(keyword)
                );

                if (isFootball) {
                    const channelName = channels[channelId] || channelId; // Użyj czystej nazwy kanału

                    const startTime = parseEpgTime(start);
                    const stopTime = parseEpgTime(stop);

                    foundMatches.push({
                        channel: channelName,
                        title: item.title.$text, // Zapisz oryginalny tytuł
                        description: item.desc?.$text || '', // Oryginalny opis (jeśli jest)
                        start: startTime ? startTime.toISOString() : start,
                        end: stopTime ? stopTime.toISOString() : stop,
                    });
                }
            } catch (parseError) {
                console.error("Błąd podczas przetwarzania elementu <programme>:", parseError.message, item);
            }
        });

        xml.on('error', function(err) {
            console.error('Błąd parsowania XML:', err.message);
        });

        xml.on('end', function() {
            console.log(`Przetworzono ${channelCount} kanałów i ${programCount} programów.`);
            console.log(`Parsowanie zakończone. Znaleziono ${foundMatches.length} potencjalnych meczów.`);
            console.log("\n--- Przykładowe znalezione mecze ---");
            console.log(JSON.stringify(foundMatches.slice(0, 20), null, 2));
        });

    } catch (error) {
        // ... (obsługa błędów axios bez zmian) ...
        console.error('Błąd podczas pobierania EPG:', error.message);
        if (error.response) { console.error('Status odpowiedzi:', error.response.status); }
    }
}

// Funkcja pomocnicza do parsowania czasu EPG (bez zmian)
function parseEpgTime(timeString) {
    const match = timeString?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/); // Uczyniono strefę czasową opcjonalną
    if (!match) return null;
    const isoString = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`; // Nadal zakładamy UTC
    try { return new Date(isoString); } catch (e) { return null; }
}

// Uruchomienie procesu
processEpg();