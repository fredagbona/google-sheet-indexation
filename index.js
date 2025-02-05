const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 3000;

require('dotenv').config();

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  //keyFile: '/credentials.json', 
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SPREADSHEET_ID = '1YAtzREf8v4YbN-FdO0S6I1I24qVmdi14UO6T6JSLj64';
const SHEET_NAME = 'Main';

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

let wsClient = null;

wss.on('connection', (ws) => {
  wsClient = ws;
  console.log('Client connecté via WebSocket.');
});

function sendLog(message) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(message);
  }
}

async function updateSheet(auth, rowIndex, status) {
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[status]],
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkIndexation(domain) {
  try {
    const response = await axios.get('https://searx.be/search', {
      params: {
        q: `site:${domain}`,
        format: 'json',
        engines: 'google',
      },
    });

    const results = response.data.results;

    // Si des résultats sont trouvés, le domaine est indexé
    return results.length > 0 ? 'Indexé' : 'Non indexé';
  } catch (error) {
    console.error(`Erreur API SearXNG pour ${domain} :`, error.message);
    return 'Erreur API SearXNG';
  }
}

async function executeScript() {
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:A`,
  });

  const domains = res.data.values;

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i][0];
    sendLog(`Vérification de ${domain}...`);
    console.log(`Vérification de ${domain}...`);

    try {
      const status = await checkIndexation(domain);
      await updateSheet(auth, i + 2, status);
      sendLog(`Statut de ${domain} : ${status}`);
      console.log(`Statut de ${domain} : ${status}`);
    } catch (error) {
      sendLog(`Erreur pour ${domain} : ${error.message}`);
      console.error(`Erreur pour ${domain} :`, error.message);
      await updateSheet(auth, i + 2, 'Erreur');
    }

    await sleep(10000);
  }

  sendLog('Script terminé.');
  console.log('Script terminé.');
}

app.post('/execute', async (req, res) => {
  try {
    await executeScript();
    res.status(200).send('Script exécuté avec succès !');
  } catch (error) {
    res.status(500).send(`Erreur lors de l'exécution : ${error.message}`);
  }
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
