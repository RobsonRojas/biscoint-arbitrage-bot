import fs from 'fs';
import _ from 'lodash';


const config = {
  apiKey: process.env.APIKEY || null,
  apiSecret: process.env.APISECRET || null,
  amount: process.env.AMOUNT || 100,
  amountCurrency: process.env.AMOUNTCURRENCY || 'BRL',
  initialBuy: process.env.INITIALBUY || true,
  minProfitPercent: process.env.MINPROFITPERCENT || 0.02,
  // specify null to let the bot calculate the minimum allowed interval
  intervalSeconds: process.env.INTERVALSECONDS || null,
  playSound: process.env.PLAYSOUND || false,
  simulation: process.env.SIMULATION || false,
  executeMissedSecondLeg: process.env.EXECUTEMISSEDSECONDLEG || true,
};

try {
  _.merge(config, JSON.parse(fs.readFileSync(
    `./config.json`,
  )));
} catch (err) {
  console.log('[INFO] Could not read config.json file.', err);
}

console.log(config)

export default config;
