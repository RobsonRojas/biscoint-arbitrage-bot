import Biscoint from 'biscoint-api-node';
import _ from 'lodash';
import player from 'play-sound';
import config from './config.js';

// to heroku dont blame about PORT env var
const express = require('express')
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.listen(process.env.PORT);
app.post('/', (req, res) => {
  console.log("req", req)
  console.log("res", res)

  res.sendStatus(505);
});

// bot to communicate you about transactions
const { Telegraf } = require('telegraf')
var userid = undefined;
if (process.env.BOT_TOKEN) {
  console.log("INITIALIZE TELEGRAM BOT")
  const bot = new Telegraf(process.env.BOT_TOKEN)
  bot.start((ctx) => {
    console.log(">start", ctx.from)
    let userFirstName = ctx.message.from.first_name
    let message = ` Olá ${userFirstName}, sou um bot que vai te avisar sempre que uma ordem for executada com sucesso`
    userid = ctx.from.id
  
    ctx.reply(message)
  })
  bot.launch()    
}

// read the configurations
let {
  apiKey, apiSecret, amount, amountCurrency, initialBuy, minProfitPercent, intervalSeconds, playSound, simulation,
} = config;

let bc, lastTrade = 0, isQuote;

const init = () => {
  if (!apiKey) {
    handleMessage('You must specify "apiKey" in config.json', 'error', true);
  }
  if (!apiSecret) {
    handleMessage('You must specify "apiSecret" in config.json', 'error', true);
  }

  amountCurrency = _.toUpper(amountCurrency);
  if (!['BRL', 'BTC'].includes(amountCurrency)) {
    handleMessage('"amountCurrency" must be either "BRL" or "BTC". Check your config.json file.', 'error', true);
  }

  if (isNaN(amount)) {
    handleMessage(`Invalid amount "${amount}. Please specify a valid amount in config.json`, 'error', true);
  }

  isQuote = amountCurrency === 'BRL';

  bc = new Biscoint({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret
  });
};

const checkBalances = async () => {
  const { BRL, BTC } = await bc.balance();

  handleMessage(`Balances:  BRL: ${BRL} - BTC: ${BTC} `);

  const nAmount = Number(amount);
  let amountBalance = isQuote ? BRL : BTC;
  if (nAmount > Number(amountBalance)) {
    handleMessage(
      `Amount ${amount} is greater than the user's ${isQuote ? 'BRL' : 'BTC'} balance of ${amountBalance}`,
      'error',
      true,
    );
  }
};

const checkInterval = async () => {
  const { endpoints } = await bc.meta();
  const { windowMs, maxRequests } = endpoints.offer.post.rateLimit;
  handleMessage(`Offer Rate limits: ${maxRequests} request per ${windowMs}ms.`);
  let minInterval = 2 * windowMs / maxRequests / 1000;

  if (!intervalSeconds) {
    intervalSeconds = minInterval;
    handleMessage(`Setting interval to ${intervalSeconds}s`);
  } else if (intervalSeconds < minInterval) {
    handleMessage(`Interval too small (${intervalSeconds}s). Must be higher than ${minInterval.toFixed(1)}s`, 'error', true);
  }
};

async function tradeCycle() {
  try {
    const buyOffer = await bc.offer({
      amount,
      isQuote,
      op: 'buy',
    });

    const sellOffer = await bc.offer({
      amount,
      isQuote,
      op: 'sell',
    });

    const profit = percent(buyOffer.efPrice, sellOffer.efPrice);
    handleMessage(`Calculated profit: ${profit.toFixed(3)}%`);
    if (
      profit >= minProfitPercent
    ) {
      try {
        let firstOffer, secondOffer;

        if (initialBuy) {
          firstOffer = buyOffer;
          secondOffer = sellOffer;
          handleMessage(`[${tradeCycleCount}] Buy first`);
        } else {
          firstOffer = sellOffer;
          secondOffer = buyOffer;
          handleMessage(`[${tradeCycleCount}] Sell first`);
        }

        if (simulation) {
          handleMessage('Would execute arbitrage if simulation mode was not enabled');
        } else {
          await bc.confirmOffer({
            offerId: firstOffer.offerId,
          });

          await bc.confirmOffer({
            offerId: secondOffer.offerId,
          });
        }

        lastTrade = Date.now();

        handleMessage(`[${tradeCycleCount}] Success, profit: + ${profit.toFixed(3)}% (${finishedAt - startedAt} ms)`);
        // send to bot
        if (process.env.BOT_TOKEN && userid) {
          console.log("REPLY BOT USER")
          bot.telegram.sendMessage(userid, `[${tradeCycleCount}] Success, profit: + ${profit.toFixed(3)}% (${finishedAt - startedAt} ms)`)
        }

        play();
      } catch (error) {
        handleMessage('Error on confirm offer', 'error');
        console.error(error);
      }
    }
  } catch (error) {
    handleMessage('Error on get offer', 'error');
    console.error(error);
  }
}

const startTrading = async () => {
  handleMessage('Starting trades');
  await tradeCycle();
  setInterval(tradeCycle, intervalSeconds * 1000);
};

// -- UTILITY FUNCTIONS --

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve(), ms));
}

function percent(value1, value2) {
  return (Number(value2) / Number(value1) - 1) * 100;
}

function handleMessage(message, level = 'info', throwError = false) {
  console.log(`[Biscoint BOT] [${level}] - ${message}`);
  if (throwError) {
    throw new Error(message);
  }
}

const sound = playSound && player();

const play = () => {
  if (playSound) {
    sound.play('./tone.mp3', (err) => {
      if (err) console.log(`Could not play sound: ${err}`);
    });
  }
};

async function start() {
  init();
  await checkBalances();
  await checkInterval();
  await startTrading();
}

start().catch(e => handleMessage(JSON.stringify(e), 'error'));
