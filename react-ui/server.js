const express = require('express');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';
const AGENT_BASE_URL = process.env.AGENT_BASE_URL || 'http://localhost:3001';

// Allow the Google sign-in popup to keep its opener handle (so polling
// popup.closed and window.opener.postMessage work) while still isolating the
// document from arbitrary cross-origin openers. Without this, a strict
// Cross-Origin-Opener-Policy (e.g. same-origin) makes Chrome warn on every
// popup.closed read. NOTE: if a reverse proxy / CDN in front of this server
// sets its own COOP header, change it there too — the proxy value wins.
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Serve static files from the React app build directory (except index.html)
app.use(express.static(path.join(__dirname, 'build'), { index: false }));

// Serve index.html with EJS template rendering
app.get('*', (req, res) => {
  const buildIndexPath = path.join(__dirname, 'build', 'index.html');
  const templatePath = path.join(__dirname, 'public', 'index.template.ejs');
  
  // Check if build/index.html exists (production)
  if (fs.existsSync(buildIndexPath)) {
    // Read the built index.html and inject the API_BASE_URL
    fs.readFile(buildIndexPath, 'utf-8', (err, html) => {
      if (err) {
        console.error('Error reading build index.html:', err);
        return res.status(500).send('Internal Server Error');
      }
      
      // Inject the API_BASE_URL and MCP_BASE_URL scripts before </head>
      const injectedHtml = html.replace(
        '</head>',
        `  <script>window.API_BASE_URL = '${API_BASE_URL}';</script>\n  <script>window.AGENT_BASE_URL = '${AGENT_BASE_URL}';</script>\n  </head>`
      );
      
      res.send(injectedHtml);
    });
  } else if (fs.existsSync(templatePath)) {
    // Use the EJS template (development/fallback)
    fs.readFile(templatePath, 'utf-8', (err, template) => {
      if (err) {
        console.error('Error reading template:', err);
        return res.status(500).send('Internal Server Error');
      }
      
      try {
        const rendered = ejs.render(template, { API_BASE_URL, AGENT_BASE_URL });
        res.send(rendered);
      } catch (renderErr) {
        console.error('Error rendering template:', renderErr);
        res.status(500).send('Internal Server Error');
      }
    });
  } else {
    res.status(500).send('No index.html found. Please run npm run build first.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API_BASE_URL is set to: ${API_BASE_URL}`);
  console.log(`AGENT_BASE_URL is set to: ${AGENT_BASE_URL}`);
  console.log(`To change them, set the API_BASE_URL and AGENT_BASE_URL environment variables`);
});