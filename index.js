// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, GuildChannel, Emoji, PartialGroupDMChannel } = require('discord.js');
const { globalPrefix, token } = require('./config.json');
const { wordsToNumbers } = require('words-to-numbers');
const { evaluate } = require('mathjs');
const Keyv = require('keyv');
const keyv = new Keyv({ serialize: JSON.stringify, deserialize: JSON.parse });
const prefixes = new Keyv('sqlite://path/to.sqlite');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
    ]
});

String.prototype.insert = function(index, string) {
    if (index > 0) {
        return this.substring(0, index) + string + this.substring(index, this.length);
    }

    return string + this;
};

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
    constructor(name, desc, preset) {
        this.name = name;
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

// function replaceAll(str1, str2, ignore) 
// {
//     return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
// }

function noPingReply(message, reply)
{
    message.reply({ 
        content: reply, 
        allowedMentions: { repliedUser: false }
    });
}

const commands = [
    //help
    new Command("bot/support", "help", "lists all commands", function(message, parameters) {
        let response = "";
        function addToHelp(com) {
            response += `$${com.commandName} (`;
            for (let i = 0; i < com.params.length; i++) {
                let name = com.params[i].name;
                response += i === com.params.length - 1 ? name : `${name}, `;
            }
            response += `) : ${com.desc} \n`;
            if (parameters["paramDescs"]) {
                for (let i = 0; i < com.params.length; i++) {
                    response += `-${com.params[i].name} : ${com.params[i].desc} \n`;
                }
            }
        }
        if (Boolean(parameters["whichCommand"])) {
            addToHelp(commands.find(x => x.commandName === parameters["whichCommand"]));
        } else {
            commands.forEach(x => addToHelp(x));
        }
        noPingReply(message, response);
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
        new Param("debugMode", "idk what this does yet lol", false),
    ], []),

    //eval
    new Command("general/fun", "math", "does the math put in front of it", function(message, parameters) {
        var eval = '';
        try {
            eval = evaluate(parameters["equation"]);
        } catch (error) {
            eval = error;
        }
        noPingReply(message, String(eval));
    }, [
        new Param("equation", "the equation to be evaluated", ""),
        //new Param("return", "should the ", ""),
    ], []),

    // run
    new Command("general/fun", "eval", "astrl only!! runs javascript code from a string", function(message, parameters) {
        var code = '';
        try {
            code = eval(parameters["code"]);
            if (parameters["return"]) noPingReply(message, String(code));
        } catch (error) {
            noPingReply(message, String(error));
        }
    }, [
        new Param("code", "the code to run", ""),
        new Param("return", "should the ", true),
    ], [ "438296397452935169" ]),
    
    // echo
    new Command("general/fun", "echo", "echoes whatever's in front of it", function(message, parameters) {
        let reply = "something broke";
        try {
            reply = parameters["reply"];
            message.channel.send(reply);
        } catch (error) {
            message.channel.send(error);
        }
    }, [
        new Param("reply", "the message to echo back to you", "..."),
    ], []),
    
    // countHere
    new Command("patterns/counting", "countHere", "sets the current channel to be the channel used for counting", function(message, parameters) {
        let isChannel = countingChannel === message.channel.id

        countingChannel = isChannel ? "" : message.channel.id;
        message.channel.send(isChannel ? 'counting in this channel has ceased.' : 'alright. start counting then.')
    }, [], [ "438296397452935169" ]),
    
    // resetCount
    new Command("patterns/counting", "resetCount", "resets the current count", function(message, parameters) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], [ "438296397452935169" ]),

    // chainHere
    new Command("patterns/chaining", "chainHere", "sets the current channel to be the channel used for message chains", function(message, parameters) {
        let isChannel = chainChannel === message.channel.id

        countingChannel = isChannel ? "" : message.channel.id;
        message.channel.send(isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.')
    }, [

    ], [ "438296397452935169" ]),

    // autoChain
    new Command("patterns/chaining", "autoChain", "will let any channel start a chain", function(message, parameters) {
        
    }, [ new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4) ], [ "438296397452935169" ]),
    
    new Command("bot", "kill", "kills the bot", function(message, parameters) {
        message.channel.send('bot is now dead 😢');
        client.destroy();
    }, [], 
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),
    
    new Command("bot", "test", "kills the bot", function(message, parameters) {
        message.channel.send('bot is now dead 😢');
        client.destroy();
    }, [
        new Param("secondTest", "", "")
    ], 
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

// blacklist list, the function to push to it will be blacklist()
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

// keyv stuff
keyv.on('error', err => console.error('Keyv connection error:', err));

// when the client is ready, run this code
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
    let cont = message.content;

    for (let i = 0; i < commands.length; i++) {
        let com = commands[i];

        if (("$"+com.commandName) === message.content.split(' ')[0]) {
            if (com.limitedTo.length === 0 || com.limitedTo.includes(message.author.id)) {
                // parameter stuff
                let paramObj = {};
                if (message.content.split(' ')[1] !== null) {
                    let sections = message.content.split('"');
                    if (message.content.includes('"')) {
                        for (let i = 0; i < sections.length; i++) {
                            if (i % 2 == 1 && sections[i].includes(' ')) {
                                sections[i] = sections[i].split(' ').join('');
                            }
                        }
                    }
                    let tempParameters = sections.join('').split(' ');
                    tempParameters.shift();

                    let j = 0;
                    for (let i = 0; i < tempParameters.length; i++) {
                        if (tempParameters[i].includes(':') && com.params.forEach(x => x.name === tempParameters[i].split(':')[0])) {
                            let name = tempParameters[i].split(':')[0];
                            paramObj[name] = paramFunc(tempParameters[i], com.params[i]);
                        } else {
                            let name = com.params[j].name;
                            paramObj[name] = paramFunc(tempParameters[i], com.params[j]);
                            j++;
                        }
                    }
                    for (let i = 0; i < com.params.length; i++) {
                        let param = com.params[i];
                        if (paramObj[param.name] === null) {
                            paramObj[param.name] = param.preset;
                        } 
                    }
                }

                com.func(message, paramObj);
            } else {
                await message.reply('hey, you can\'t use this command!');

            }
            return;
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
            num = evaluate(content.substring(0, matches[matches.length - 1]));
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
    }
});

// Log in to Discord with your client's token
client.login(token);