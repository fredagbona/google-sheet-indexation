const express = require('express');
const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 3000;


require('dotenv').config();


const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
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

async function checkIndexation(domain) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
        '--no-sandbox',               
        '--disable-setuid-sandbox',    
        '--disable-dev-shm-usage',    
        '--no-zygote',                
        '--single-process',            
        '--disable-accelerated-2d-canvas',
        '--disable-gl-drawing-for-tests',  
      ], 
  });

  const page = await browser.newPage();

  const searchUrl = `https://www.google.com/search?q=site:${domain}`;
  await page.goto(searchUrl);

  const isIndexed = await page.evaluate(() => {
    return !document.body.innerText.includes('Aucun document ne correspond aux termes de recherche spécifiés');
  });

  await browser.close();
  return isIndexed ? 'Indexé' : 'Non indexé';
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
