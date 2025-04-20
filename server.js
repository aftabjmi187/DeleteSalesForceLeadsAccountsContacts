// server.js
const express = require('express');
const path = require('path');
const { chromium } = require('playwright');
const { exec } = require('child_process');
const app = express();
const PORT = process.env.PORT || 2095;

let currentBrowser = null;
let clients = [];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/delete', async (req, res) => {
  const { username, password, target } = req.body;
  broadcast(`⏳ Logging into Salesforce to delete ${target}s...`);

  try {
    if (currentBrowser) await currentBrowser.close();
    currentBrowser = await chromium.launch({ headless: false });
    const context = await currentBrowser.newContext();
    const page = await context.newPage();

    await page.goto('https://login.salesforce.com/');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log In' }).click();

    await page.waitForSelector('text=Home', { timeout: 30000 });

    broadcast('✅ Logged in. Navigating to target object...');

    const deleteObject = async () => {
      try {
        switch (target) {
          case 'lead':
            await page.click('text=Leads');
            await page.click('text=Mass Delete Leads');
            await page.getByLabel('Permanently delete the').check();
            break;

          case 'contact':
            await page.locator('a').filter({ hasText: 'Contacts' }).first().click();
            await page.waitForTimeout(2000);
            await page.locator('a').filter({ hasText: 'Mass Delete Contacts' }).first().click();
            await page.waitForTimeout(2000);
            await page.getByRole('cell', {
              name: 'Permanently delete the selected records. When this option is selected, you cannot restore deleted records from the Recycle Bin. Please be careful when selecting this option.',
              exact: true
            }).locator('div').click();
            break;

          case 'account':
            await page.click('#Account_Tab');
            await page.getByRole('link', { name: 'Mass Delete Accounts' }).click();
            await page.getByLabel('Delete Accounts that have').check();
            await page.getByLabel('Delete Accounts that are').check();
            await page.getByLabel('Permanently delete the').check();
            break;

          default:
            broadcast(`❌ Unknown target: ${target}`);
            return false;
        }

        await page.getByTitle('Search', { exact: true }).click();
        const noRecords = await page.locator('text=No records to display.').isVisible();
        if (noRecords) {
          broadcast(`🎉 Finished: No more ${target}s to delete.`);
          return false;
        }

        await page.getByRole('checkbox', { name: 'Toggle All Rows' }).check();
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('button', { name: 'Delete' }).nth(2).click();
        await page.waitForTimeout(3000);
        await page.reload();

        return true;
      } catch (err) {
        broadcast(`⚠️ Error during deletion of ${target}s: ${err.message}`);
        return false;
      }
    };

    let round = 1;
    while (await deleteObject()) {
      const totalDeleted = round * 250;
      broadcast(`🔁 Round ${round} complete — Deleted  ${totalDeleted} ${target}s`);
      round++;
    }

    await context.close();
    await currentBrowser.close();
    currentBrowser = null;
    broadcast(`🚀 Deletion complete for ${target}s.`);

  } catch (err) {
    broadcast(`❌ Script failed: ${err.message}`);
    if (currentBrowser) {
      await currentBrowser.close();
      currentBrowser = null;
    }
  }

  res.sendStatus(200);
});

app.post('/cancel', async (req, res) => {
  if (currentBrowser) {
    await currentBrowser.close();
    currentBrowser = null;
    broadcast('❌ Operation cancelled by user.');
  }
  res.sendStatus(200);
});

app.get('/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.push(res);
  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

function broadcast(message) {
  console.log(message);
  clients.forEach(client => client.write(`data: ${message}\n\n`));
}

// Automatically open the localhost URL in the default browser
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`🟢 Server running at ${url}`);

  const startCmd = process.platform === 'win32' ? 'start' :
                   process.platform === 'darwin' ? 'open' :
                   'xdg-open';

  exec(`${startCmd} ${url}`);
});
