const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  await page.goto('https://danube-webshop.herokuapp.com')
  await browser.close()
})()

