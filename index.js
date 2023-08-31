// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, GuildChannel, Emoji } = require('discord.js');
const { token } = require('./config.json');
const { wordsToNumbers } = require('words-to-numbers');
const { evaluate } = require('mathjs');

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
    constructor(genre, commandName, desc, func, params = [], limitedTo = []) {
        this.genre = genre;
        this.commandName = commandName;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
    }
}

class Param {
    constructor(paramName, desc, preset) {
        this.paramName = paramName;
        this.desc = desc;
        this.preset = preset;
    }
}



class SaveData {
    constructor(currentNumber, prevNumber, highestNumber, lastCounter, currentChain, chainAmount, prevChain, lastChainer, countingChannel, chainChannel) {
        // counting stuff
        this.currentNumber = currentNumber;
        this.prevNumber = prevNumber;
        this.highestNumber = highestNumber;
        this.lastCounter = lastCounter;
        // chain stuff
        this.currentChain = currentChain;
        this.chainAmount = chainAmount;
        this.prevChain = prevChain;
        this.lastChainer = lastChainer;
        // channel persistence
        this.countingChannel = countingChannel;
        this.chainChannel = chainChannel;
    }
}

var saveData;

function save() {
    saveData = new SaveData(
        currentNumber,
        prevNumber,
        highestNumber,
        lastCounter,
        currentChain,
        chainAmount,
        prevChain,
        lastChainer,
        countingChannel,
        chainChannel,
    )
    fs.writeFileSync('./save-data.json', JSON.stringify(saveData));
}

function paramFunc(content, param) 
{
    let type = typeof param.preset;
    switch (type.toLowerCase())
    {
        case "string":
            return String(content);
        case "number":
            return Number(content);
        case "boolean":
            return content.toLowerCase() == "true" ? true : false;
        default:
            throw "Unsupported type";
    }
}

function everythingAfter(content)
{
    return content.substring(content.indexOf(' '));
}

function noPingReply(message, reply)
{
    message.reply({ 
        content: reply, 
        allowedMentions: { repliedUser: false }
    })
}

const commands = [
    //help
    new Command("bot", "help", "lists all commands", function(message) {
        let response = message.author.toString() + "\n";
        let content = message.content.split(' ')[1];
        
        let whichCommand = paramFunc(content, this.params[0]);
        console.log(message.content.split(' ')[1]);
        if (message.content.split(' ')[1] === undefined) {
            for (let i = 0; i < commands.length; i++) {
                let element = commands[i];
                response += `$${element.commandName} : ${element.desc} \n`;
                if (element.params.count !== undefined) {
                    response += `$${element.commandName} : ${element.desc} \n`;
                }
            }
        } else {
            message.react('✅');
            let command = commands.find(x => x.commandName === whichCommand);
            response = `$${command.commandName} : ${command.desc}`;
        }
        noPingReply(message, response);
    }, [new Param("whichCommand", "", "")], []),

    //eval
    new Command("fun", "eval", "does the math put in front of it", function(message) {
        var eval = '';
        try {
            eval = evaluate(everythingAfter(message.content));
        } catch (error) {
            eval = error;
        }
        noPingReply(message, String(eval));
    }, [], [ "438296397452935169" ]),
    
    //echo
    new Command("fun", "echo", "echoes whatever's in front of it", function(message) {
        let reply = "something broke";
        try {
            reply = everythingAfter(message.content);
        } catch (error) {
            reply = error;
        } finally {
            message.channel.send(reply);
        }
    }, [], [ "438296397452935169" ]),
    
    //countHere
    new Command("patterns/counting", "countHere", "sets the current channel to be the channel used for counting", function(message) {
        if (countingChannel = message.channel.id) {
            countingChannel = "";
            message.channel.send('counting in this channel has ceased.');
        } else {
            countingChannel = message.channel.id;
            message.channel.send('alright. start counting then.');
        }
    }, [], [ "438296397452935169" ]),
    
    //resetCount
    new Command("patterns/counting", "resetCount", "resets the current count", function(message) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], [ "438296397452935169" ]),

    //chainHere
    new Command("patterns/chaining", "chainHere", "sets the current channel to be the channel used for message chains", function(message) {
        if (chainChannel === message.channel.id) {
            chainChannel = "";
            message.channel.send('the chain in this channel has been eliminated.');
        } else {
            chainChannel = message.channel.id;
            message.channel.send('alright. start a chain then.');
        }
    }, [], [ "438296397452935169" ]),

    //autoChain
    new Command("patterns/chaining", "autoChain", "sets the current channel to be the channel used for message chains", function(message) {
        
    }, [ new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4) ], [ "438296397452935169" ]),
    
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
var currentNumber = 0;  // the last number said that was correct
var prevNumber    = 0;  // used to reset back to the last number if i messed up my code
var highestNumber = 0;  // the highest number ever gotten to
var lastCounter   = ""; // used to check for duplicates

// chain variables
var currentChain = ""; // 
var chainAmount  = 0;  // 
var prevChain    = ""; // 
var lastChainer  = ""; // 

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
    save();
}

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
    //console.log(client.channels.fetch('887502008876167212'));
    //client.channels.fetch('887502008876167212')
    //    .then(channel => channel.send('DIE DIE DIE'))
    //    .catch(console.error("blehhh"));
    try {
        saveData = JSON.parse(fs.readFileSync('./save-data.json', 'utf8')); // Load save data
    } catch(e) {
        // Init if no save data found
        saveData = new SaveData();
    }
});

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    for (let i = 0; i < commands.length; i++) {
        let com = commands[i];
        if (("$"+com.commandName) === message.content.toLowerCase().split(' ')[0]) {
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
        save();
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
        save();
    }
});

// Log in to Discord with your client's token
client.login(token);