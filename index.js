// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, GuildChannel, Emoji } = require('discord.js');
const { token } = require('./config.json');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

var currentNumber = 0;
var highestNumber = 0;

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
    console.log(client.channels.fetch('887502008876167212'));
    client.channels.fetch('887502008876167212')
        .then(channel => channel.send('DIE DIE DIE'))
        .catch(console.error("blehhh"));
});

//client.on(Events.Error, async interaction => console.log("kaboom"));
//process.on('uncaughtException', async interaction => console.log("kaboom"));

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    message.reply(message.content.substring(0, 3));
    if (message.content.substring(0, 5) == "%eval") {
        if (message.author.username == 'astrljelly') {
            message.reply(message.content.substring(6));
            eval(message.content.substring(6));
        } else {
            message.reply('ermmm only astrl can use this???');
        }
        return;
    }
    
    let num = parseFloat(message.content, 10);
    message.channel.send('test');
    if (num == null) message.channel.send('uh oh. something broke. ping astrl for help.');
    if (num == currentNumber + 1) {
        //message.react('\:white_check_mark:')
        currentNumber++;
    } else {
        if (currentNumber > highestNumber) highestNumber = currentNumber;
        currentNumber = 0;
        await message.reply('you got pretty far. but i think you could definitely do better than ' + highestNumber + '.');
    }
});

// Log in to Discord with your client's token
client.login(token);