// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, GuildChannel, Emoji } = require('discord.js');
const { token } = require('./config.json');
const { wordsToNumbers } = require('words-to-numbers');
const { evaluate } = require('mathjs');
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

const people = [
    { 
        userId:"", 
        strikes:0, 
        desc:""
    }
];

const commands = [
    { 
        commandName: "help",
        desc: "lists all commands",
        limitedTo: [],
        params: [],
        command: function(message)
        {
            let response = message.author.toString() + "\n";
            for (let i = 0; i < commands.length; i++) {
                let element = commands[i];
                response += "$"+element.commandName + " : " + element.desc + "\n";
            }
            message.reply(response);
        }
    },
    {
        commandName: "eval",
        desc: "does the math put in front of it",
        limitedTo: [ 
            "438296397452935169" 
        ],
        params: [],
        command: function(message)
        {
            var eval = '';
            try {
                eval = evaluate(message.content.substring(6, message.content.length));
            } catch (error) {
                eval = error;
            }
            message.reply(String(eval));
            return;
        }
    },
    {
        commandName: "echo",
        desc: "echoes whatever's in front of it",
        limitedTo: [],
        params: [],
        command: function(message)
        {
            let reply = "something broke";
            try {
                reply = message.content.substring(this.commandName.length + 2);
            } catch (error) {
                reply = error;
            } finally {
                message.channel.send(reply);
            }
            
            return;
        }
    },
    {
        commandName: "countHere",
        desc: "sets the current channel to be the channel used for counting",
        limitedTo: [ 
            "438296397452935169" 
        ],
        params: [],
        command: function(message) 
        {
            countingChannel = message.channel.id;
            message.reply('alright. start counting then.');
            return;
        }
    },
    {
        commandName: "chainHere",
        desc: "sets the current channel to be the channel used for message chains",
        limitedTo: [ 
            "438296397452935169" 
        ],
        params: [],
        command: function(message) 
        {
            chainChannel = message.channel.id;
            message.reply('alright. start a chain then.');
            return;
        }
    },
];


var currentNumber = 0; // the last number said that was correct
var prevNumber = 0;    // used to reset back to the last number if i messed up my code
var highestNumber = 0; // the highest number ever gotten to 
var lastCounter = "";  // used to check for duplicates

// are set using commands
var countingChannel = "";
var chainChannel = "";

// blacklist list, the function to push to it is blacklist()
const bl = [];

function isMe(user) {
    return user.id === '438296397452935169';
}

// function isBlacklisted(user) {
//     return p1 * p2;
// }

async function resetNumber(message, reply = 'empty. astrl screwed up lol')
{
    if (currentNumber > highestNumber) highestNumber = currentNumber;
    lastCounter = '';
    prevNumber = currentNumber;
    currentNumber = 0;
    message.react('💀');
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
            if (commands.limitedTo === undefined || com.limitedTo.includes(message.author.id)) {
                com.command(message);
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
                    message.reply('yeah that doesn\'t work. sorry \n');
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
        message.channel.send('chains aren\'t set up right now, astrl will add them soon');
        chainChannel = "";
    }
});

// Log in to Discord with your client's token
client.login(token);