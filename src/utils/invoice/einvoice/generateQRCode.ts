// src/utils/invoice/einvoice/generateQRCode.ts
import QRCode from 'qrcode';

export const generateQRDataUrl = async (uuid: string, longId: string): Promise<string> => {
  const url = `https://myinvois.hasil.gov.my/${uuid}/share/${longId}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 100,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    return qrDataUrl;
  } catch (err) {
    console.error('Error generating QR code:', err);
    throw err;
  }
};