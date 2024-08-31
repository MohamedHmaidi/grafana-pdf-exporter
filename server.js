const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = 3001;

app.get('*', async (req, res) => {
  try {
    // Construct the URL to navigate to
    const url = `grafana_url:port${req.url}`;
    console.log('Navigating to URL:', url);

    // Launch Puppeteer with no-sandbox and disable-setuid-sandbox flags
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Basic Auth credentials (if needed)
    const auth_header = 'Basic ' + Buffer.from('admin:password').toString('base64');
    await page.setExtraHTTPHeaders({ 'Authorization': auth_header });

    // Increase timeout to 180 seconds for slow-loading panels
    await page.setDefaultNavigationTimeout(180000);

    // Set the initial viewport width and height
    const width_px = 1200;
    let height_px = 800; // Default height, will adjust later

    await page.setViewport({
      width: width_px,
      height: height_px,
      deviceScaleFactor: 2,
      isMobile: false,
    });

    // Navigate to the Grafana dashboard
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the dashboard to fully load
    await page.waitForSelector('.react-grid-layout', { timeout: 180000 });

    // Additional wait for all images and iframes to load
    await page.waitForFunction(() => {
      const images = document.querySelectorAll('img');
      const iframes = document.querySelectorAll('iframe');
      return Array.from(images).every(img => img.complete) &&
             Array.from(iframes).every(iframe => iframe.contentDocument.readyState === 'complete');
    }, { timeout: 180000 });

    // Hide panel info and resize handles
    await page.evaluate(() => {
      let infoCorners = document.getElementsByClassName('panel-info-corner');
      for (let el of infoCorners) { el.hidden = true; }
      let resizeHandles = document.getElementsByClassName('react-resizable-handle');
      for (let el of resizeHandles) { el.hidden = true; }
    });

    // Ensure all elements are visible
    await page.evaluate(() => {
      document.querySelectorAll('.panel-container').forEach(panel => {
        panel.style.display = 'block';
      });
    });

    // Scroll through the page multiple times to ensure all content is loaded
    for (let i = 0; i < 3; i++) {
      await page.evaluate(async () => {
        const scrollable = document.querySelector('.react-grid-layout');
        if (scrollable) {
          scrollable.scrollTop = scrollable.scrollHeight;
          await new Promise(resolve => setTimeout(resolve, 10000)); // Increased wait time
        }
      });
    }

    // Additional delay for rendering
    await new Promise(resolve => setTimeout(resolve, 15000)); // Wait an additional 15 seconds for rendering

    // Take a screenshot for debugging
    await page.screenshot({ path: 'screenshot.png', fullPage: true });

    // Calculate the height of the dashboard content after scrolling
    const fullHeight_px = await page.evaluate(() => {
      const layout = document.querySelector('.react-grid-layout');
      return layout ? layout.scrollHeight : document.body.scrollHeight;
    });

    // Add extra height to ensure no content is cut off
    const extraHeight = 2000; // Adjust as needed
    height_px = fullHeight_px + extraHeight;

    // Set the viewport to the full height of the content
    await page.setViewport({
      width: width_px,
      height: height_px,
      deviceScaleFactor: 2,
      isMobile: false,
    });

    // Generate the PDF with the calculated dimensions and include background
    await page.pdf({
      path: 'grafana_dashboard.pdf',
      width: width_px + 'px',
      height: height_px + 'px',
      scale: 1,
      displayHeaderFooter: false,
      printBackground: true, // Include backgrounds
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    await browser.close();

    // Send the PDF as a response
    res.sendFile(`${__dirname}/grafana_dashboard.pdf`);

  } catch (error) {
    console.error('An error occurred:', error);
    res.status(500).send('Error generating PDF');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});