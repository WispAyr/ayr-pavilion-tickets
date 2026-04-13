const QRCode = require('qrcode');

async function generateQrDataUrl(ticketCode) {
  const scanUrl = `${process.env.APP_URL || 'http://localhost:5173'}/tickets/${ticketCode}`;

  const dataUrl = await QRCode.toDataURL(scanUrl, {
    width: 400,
    margin: 2,
    color: {
      dark: '#D4A843',
      light: '#1a1a2e'
    },
    errorCorrectionLevel: 'H'
  });

  return dataUrl;
}

async function generateQrBuffer(ticketCode) {
  const scanUrl = `${process.env.APP_URL || 'https://tickets.ayrpavilion.com'}/tickets/${ticketCode}`;

  const buffer = await QRCode.toBuffer(scanUrl, {
    width: 400,
    margin: 3,
    color: {
      dark: '#000000',
      light: '#ffffff'
    },
    errorCorrectionLevel: 'H'
  });

  return buffer;
}

async function generateGroupPassQR(token) {  const content = `GROUP:${token}`;  const buffer = await QRCode.toBuffer(content, {    width: 400,    margin: 3,    color: { dark: "#000000", light: "#ffffff" },    errorCorrectionLevel: "H"  });  return buffer;}module.exports = { generateQrDataUrl, generateQrBuffer, generateGroupPassQR };
