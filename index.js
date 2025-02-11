const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const SPREADSHEET_ID = '1YAtzREf8v4YbN-FdO0S6I1I24qVmdi14UO6T6JSLj64';
const SHEET_NAME = 'Main';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;  

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
let wsClient = null;

// wss.on('connection', (ws) => {
//   wsClient = ws;
//   console.log('Client connecté via WebSocket.');
// });

wss.on('connection', (ws) => {
  wsClient = ws;
  console.log('Nouvelle connexion WebSocket établie.');
  ws.on('message', (message) => {
    console.log('Message reçu :', message);
  });
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

async function checkIndexation(domain) {
  try {
    const response = await axios.post(
      'https://api.tavily.com/search',
      { query: `site:${domain}` },
      {
        headers: {
          'Authorization': `Bearer ${TAVILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const { results } = response.data;

    // Si le tableau 'results' est vide, cela signifie que le site n'est pas indexé
    return results.length > 0 ? 'Indexé' : 'Non indexé';
  } catch (error) {
    console.error(`Erreur API Tavily pour ${domain} :`, error.message);
    return 'Erreur API Tavily';
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
