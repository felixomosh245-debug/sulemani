// Puts phone numbers into the format WhatsApp uses: country code + number, digits only.
// "0712 345 678", "+254712345678" and "254712345678" all become "254712345678".
const { settings } = require('./config');

function normalisePhone(input, countryCode = settings.defaultCountryCode) {
  let digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = countryCode + digits.slice(1);
  return digits;
}

module.exports = { normalisePhone };
