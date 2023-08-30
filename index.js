// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, GuildChannel, Emoji } = require('discord.js');
const { token } = require('./config.json');
const { wordsToNumbers } = require('words-to-numbers');
const { evaluate, boolean } = require('mathjs');
const { count } = require('console');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ]
});

class Person {
    constructor(userId, strikes, desc) {
        this.userId = userId;
        this.strikes = strikes;
        this.desc = desc;
    }
}

class Command {
    constructor(type, commandName, desc, func, params = [], limitedTo = []) {
        this.type = type;
        this.commandName = commandName;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
    }
}

class Param {
    constructor(paramName, desc, type, preset = null) {
        this.paramName = paramName;
        this.desc = desc;
        this.type = type;
        this.preset = preset;
    }
}

const commands = [
    new Command("bot", "help", "lists all commands", function(message) {
        let response = message.author.toString() + "\n";
        if (this.params[0])
        for (let i = 0; i < commands.length; i++) {
            let element = commands[i];
            response += `$${element.commandName} : ${element.desc} \n`;
        }
        message.reply(response);
    }, [new Param("whichCommand", "", typeof(String))], []),

    new Command("fun", "eval", "does the math put in front of it", function(message) {
        var eval = '';
        try {
            eval = evaluate(message.content.substring(6, message.content.length));
        } catch (error) {
            eval = error;
        }
        message.reply(String(eval));
    }, [], [ "438296397452935169" ]),
    
    new Command("fun", "echo", "echoes whatever's in front of it", function(message) {
        let reply = "something broke";
        try {
            reply = message.content.split(this.commandName.length + 2);
        } catch (error) {
            reply = error;
        } finally {
            message.channel.send(reply);
        }
    }, [], [ "438296397452935169" ]),
    
    new Command("patterns/counting", "countHere", "sets the current channel to be the channel used for counting", function(message) {
        if (countingChannel = message.channel.id) {
            countingChannel = "";
            message.reply('counting in this channel has ceased.');
        } else {
            countingChannel = message.channel.id;
            message.reply('alright. start counting then.');
        }
    }, [], [ "438296397452935169" ]),
    
    new Command("patterns/counting", "resetCount", "resets the current count", function(message) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], [ "438296397452935169" ]),

    new Command("patterns/chaining", "chainHere", "sets the current channel to be the channel used for message chains", function(message) {
        if (chainChannel === message.channel.id) {
            chainChannel = "";
            message.reply('the chain in this channel has been eliminated.');
        } else {
            chainChannel = message.channel.id;
            message.reply('alright. start a chain then.');
        }
        
    }, [], [ "438296397452935169" ]),

    new Command("patterns/chaining", "autoChain", "sets the current channel to be the channel used for message chains", function(message) {
        if (chainChannel === message.channel.id) {
            chainChannel = "";
            message.reply('the chain in this channel has been eliminated.');
        } else {
            chainChannel = message.channel.id;
            message.reply('alright. start a chain then.');
        }
    }, [ new Param("howMany", "how many messages in a row does it take for the chain to trigger?", typeof(Number), 4) ], [ "438296397452935169" ]),
    
    new Command("bot", "kill", "kills the bot", function(message) {
        message.channel.send('bot is now dead 😢');
        client.destroy();
    }, [], 
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),
];

// counting variables
var currentNumber = 0; // the last number said that was correct
var prevNumber = 0;    // used to reset back to the last number if i messed up my code
var highestNumber = 0; // the highest number ever gotten to
var lastCounter = "";  // used to check for duplicates

// chain variables
var currentChain = "";
var chainAmount = 0;
var prevChain = "";
var lastChainer = "";

// are set using commands
var countingChannel = "";
var chainChannel = "";

// blacklist list, the function to push to it is blacklist()
const bl = [];

async function resetNumber(message, reply = 'empty. astrl screwed up lol', react = '💀')
{
    if (currentNumber > highestNumber) highestNumber = currentNumber;
    lastCounter = '';
    prevNumber = currentNumber;
    currentNumber = 0;
    message.react(react);
    await message.reply(reply);
}

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
    //console.log(client.channels.fetch('887502008876167212'));
    //client.channels.fetch('887502008876167212')
    //    .then(channel => channel.send('DIE DIE DIE'))
    //    .catch(console.error("blehhh"));
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    for (let i = 0; i < commands.length; i++) {
        let com = commands[i];
        if (("$"+com.commandName) === message.content.substring(0, com.commandName.length + 1)) {
            if (com.limitedTo.count === undefined || com.limitedTo.includes(message.author.id)) {
                com.func(message);
                return;
            } else {
                await message.reply('hey, you can\'t use this command!');
            }
        }
    }
    
    if (message.channel.id === countingChannel) {
        var num = 0;
        
        var content = String(wordsToNumbers(message.content));

        var matches = content.match('|');
        if (matches == undefined) {
            matches = content.match('/\d+/');
        }
        try {
            num = evaluate(content.substring(0, matches[matches.count - 1]));
        } catch (error) {
            if (!isNaN(content[0])) {
                try {
                    num = parseInt(content);
                } catch (error) {
                    message.reply('yeah that doesn\'t work. sorry \n' + error);
                }
            }
            return;
        }

        if (lastCounter === message.author.id) {
            resetNumber(message, 'uhhh... you know you can\'t count twice in a row, right??');
            return;
        }
        
        if (num == currentNumber + 1) {
            message.react('✅');
            lastCounter = message.author.id;
            currentNumber++;
        } else {
            resetNumber(message, (prevNumber < 10) ?
                'you can do better than THAT...' :
                'you got pretty far. but i think you could definitely do better than ' + highestNumber + '.'
            );
        }
    } else if (message.channel.id === chainChannel) {
        if (!currentChain) {
            currentChain = message.content.toLowerCase();
            chainAmount = 1;
            return;
        }
        if (message.content.toLowerCase() === currentChain && lastChainer !== message.author.id) {
            chainAmount++;
            if (chainAmount >= 3) message.react('⛓️');
        } else {
            if (chainAmount >= 3) message.react('💔');
            currentChain = message.content.toLowerCase();
            chainAmount = 1;
        }
        lastChainer = message.author.id;
        // if (message.content.toLowerCase() === currentChain) {
        //     chainAmount++;
        //     if (chainAmount > 3) message.react('⛓️');
        // } else if (chainAmount < 3) {
        //     message.react('⛓️');
        // }
    }
});

// Log in to Discord with your client's token
client.login(token);