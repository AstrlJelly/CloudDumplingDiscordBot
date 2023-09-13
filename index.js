// Require the necessary discord.js classes
const bigData = require('./bigData.json');
const process = require('node:process');
const config = require('./private/config.json');
const scp = require('node-scp');
const fs = require('fs');
const dc = require('discord.js');
const { wordsToNumbers } = require('words-to-numbers');
const { authenticate } = require('youtube-api');
const { google } = require('googleapis');
const { evaluate } = require('mathjs');

// create a new discord client instance
const client = new dc.Client({
    intents: Array.from(bigData.intents, x => eval(`dc.GatewayIntentBits.${x}`))
});

// scp client, currently just for grabbing
let remote_server = {
    host: '150.230.169.222',
    port: 22,
    username: 'opc',
}
if (fs.existsSync("./private/ssh.key")) {
    remote_server.privateKey = fs.readFileSync('./private/ssh.key');
}

let jermaFiles, jermaClips;
let scpClient;

// used to reinstate timeouts when the bot is restarted
const allTimeouts = [];

String.prototype.insert = function (index, string) {
    if (index > 0) {
        return this.substring(0, index) + string + this.substring(index, this.length);
    }

    return string + this;
};

dc.Message.prototype.replyTo = function (reply, ping = true) {
    try {
        reply = reply.toString();
        return this.reply({ content: reply, allowedMentions: { repliedUser: ping } });
    } catch (error) {
        console.error(error);
    }
};

function sleep(ms, name, push = true) {
    var t;
    return new Promise((resolve) => {
        t = setTimeout(resolve, ms);
        if (push) t = allTimeouts.push({ 
            timeout : t,
            startTime : Date.now(),
            name : name,
        });
    }).then(x => {if (push) allTimeouts.splice(t)});
}

async function autoSave() {
    await sleep(60000, false);
    console.log("Autosaving...");
    await save().catch(error => console.error("Autosave failed!  \n" + error));
    autoSave();
}

async function save() {
    fs.writeFile("./persistence/users.json", JSON.stringify({
        count : count,
        chain : chain,
        // timeouts : allTimeouts,
    }), function(err) {
        if (err) return console.error(err);
        
        var date = new Date();
        var times = [ date.getHours(), date.getMinutes(), date.getSeconds() ];
        for (var i = 0; i < times.length; i++) {
            times[i] = times[i].toString();
            if (times[i].length < 2) times[i] = "0" + times[i];
        }
        console.info(`The file was saved! (${times.join(':')})`);
    });
}

async function load() {
    fs.readFile("./persistence/users.json", 'utf-8', async function(err, data) {
        try {
            let dataObj = JSON.parse(data);
            count = dataObj.count;
            chain = dataObj.chain;
            if (allTimeouts.length) ;

            console.info("The file was loaded!");
        } catch (error) {
            console.error(error);
        }
    }); 
}

async function kill() {
    await save();
    await client.destroy();
    process.exit();
}

// typeFrom will mean you can convert from seconds to minutes, hours to ms, minutes to days, etc.
// for now it defaults to milliseconds
function convertTime(time, typeTo, typeFrom = 'ms') {
    let typeFromNum = typeNum(typeFrom);
    let typeToNum = typeNum(typeTo)
    let newTime = time;
    function typeNum(from) {
        switch (from) {
            case 's': return 1;
            case 'm': return 2;
            case 'h': return 3;
            case 'd': return 4;
            default: return 0;
        }
    }

    if (typeFromNum === typeTo) return time;

    var max = Math.max(typeToNum, typeFromNum);
    var min = Math.min(typeToNum, typeFromNum);
    var toMax = max === typeToNum;
    console.log(`typeFromNum : ${typeFromNum}, typeToNum : ${typeToNum}`);
    for (var i = min; i < max; (toMax ? i++ : i--)) {
        console.log(i);
        var num = i === 0 ? 1000 : (i === 1 || i === 2 ? 60 : 24);
        newTime = toMax ? (newTime * num) : (newTime / num);
    }
    console.log(`currently waiting for ${time} ${typeTo} (${newTime} ${typeFrom})`);
    return newTime;
}

class Command {
    constructor(genre, /* commandName,  */desc, func, params = [], limitedTo = []) {
        this.genre = genre;
        //this.commandName = commandName;
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

const _s = {
    "default" : {
        count : { // default counting variables
            channel: "",
            current: 0,      // the last number said that was correct
            prevNumber: 0,   // used to reset back to the last number if i messed up my code
            highestNum: 0,   // the highest number ever gotten to
            lastCounter: "", // used to check for duplicates
        },
        
        chain : { // default chain variables
            channel: "",
            current: "",     //
            chainLength: 0,  //
            prevChain: "",   // used to reset back to the last chain if i messed up my code
            lastChainer: "", // used to check for duplicates
            autoChain: 0,    // the amount of messages in any channel to start a chain
        }
    },
};
const _u = {};

process.on('SIGINT', async () => {
    await kill();
});

async function resetNumber(message, reply = 'empty. astrl screwed up lol', react = '💀') {
    if (count.currentNum > count.highestNum) count.highestNum = count.currentNum;
    count.lastCounter = '';
    count.prevNumber = count.currentNum;
    count.currentNum = 0;
    await message.react(react);
    await message.replyTo(reply);
}

function chainFunc(message, inRow) {
    console.log("first " + inRow);
    if (!chain.currentChain) {
        chain.currentChain = message.content.toLowerCase();
        chain.chainAmount = 1;
        return;
    }
    if (message.content.toLowerCase() === chain.currentChain && chain.lastChainer !== message.author.id) {
        chain.chainAmount++;
        if (chain.chainAmount >= inRow) message.react('⛓️');
    } else {
        if (chain.chainAmount >= inRow) message.react('💔');
        chain.prevChain = chain.currentChain;
        chain.currentChain = message.content.toLowerCase();
        chain.chainAmount = 1;
    }
    chain.lastChainer = message.author.id;
    console.log(chain);
    console.log(inRow);
}

// when the client is ready, run this code
client.once(dc.Events.ClientReady, async c => {
    console.info(`Ready! Logged in as ${c.user.tag}`);
    await load();
    autoSave();
});

client.on(dc.Events.MessageCreate, async message => {
    // if (!counts || !chains) {
    //     counts[message.guildId] = ;
    //     chains[message.guildId] = ;
    // }
    if (message.author.bot) return;
    var cont = message.content;

    var commandFromMessage = cont.split(' ')[0].substring(config.prefix.length).toLowerCase();

    if (cont.startsWith(config.prefix) && commandsObj.hasOwnProperty(commandFromMessage)) {
        var com = commandsObj[commandFromMessage];
        console.log(com);
        console.log(typeof com);

        if (com.limitedTo.length === 0 || com.limitedTo.includes(message.author.id)) {
            // parameter stuff
            var paramObj = {};
            const space = '|'; // for consistency; will always use the same character(s) for replacing spaces
            var tempParameters;
            if (Boolean(message.content.split(' ')[1])) {
                var sections = message.content.split('"');
                if (message.content.includes('"')) {
                    for (var i = 0; i < sections.length; i++) {
                        if (i % 2 == 1 && sections[i].includes(' ')) {
                            sections[i] = sections[i].split(' ').join(space);
                        }
                    }
                }
                tempParameters = sections.join('').split(' ');
                tempParameters.shift();

                var j = 0;
                for (var i = 0; i < Math.min(tempParameters.length, com.params.length); i++) {
                    // god i miss conditional statements
                    function convParam(param, content) {
                        switch ((typeof param.preset).toLowerCase()) {
                            case "string": return String(content);
                            case "number": return Number(content);
                            case "boolean": return (content.toLowerCase() == "true") ? true : false;
                            default:
                                console.error("uh oh!! that's not real.")
                                return undefined;
                        }
                    }
                    // convert space character back to actual spaces, if it needs them
                    if (tempParameters[i].includes(space)) {
                        tempParameters[i] = tempParameters[i].split(space).join(' ');
                    }
                    // decides if the current param is being manually set or not, and assigns the paramObj accordingly
                    if (tempParameters[i].includes(':')) {
                        var halves = tempParameters[i].split(':');
                        var param = com.params.find(x => x.name === halves[0]);

                        if (Boolean(param)) {
                            paramObj[halves[0]] = convParam(param, halves[1]) ?? param.preset;
                        }
                    } else {
                        paramObj[com.params[j].name] = convParam(com.params[j], tempParameters[i]);
                        j++;
                    }
                }
            }

            // if parameter is not set, use the preset
            com.params.forEach(x => {
                if (!paramObj.hasOwnProperty(x.name)) {
                    paramObj[x.name] = x.preset;
                }
            });

            try {
                com.func(message, paramObj);
            } catch (error) {
                message.replyTo(error, false);
            }
        } else {
            await message.replyTo('hey, you can\'t use this command!');
        }
        return;
    }

    if (message.channel.id === count.channel) {
        var num = 0;
        var content = String(wordsToNumbers(message.content));

        try {
            num = evaluate(content);
        } catch (error) {
            if (!isNaN(content[0])) console.error(error);
            return;
        }
        
        if (count.lastCounter === message.author.id) {
            resetNumber(message, 'uhhh... you know you can\'t count twice in a row, right??');
            return;
        }

        if (num == count.currentNum + 1) {
            message.react('✅');
            count.lastCounter = message.author.id;
            count.currentNum++;
        } else {
            resetNumber(message, (count.prevNumber < 10) ?
                'you can do better than THAT...' :
                'you got pretty far. but i think you could definitely do better than ' + count.highestNum + '.'
            );
        }
    } else if (message.channel.id === chain.channel) {
        chainFunc(message, 3);
    } else if (chain.autoChain >= 0) {
        //chainFunc(message, chain.autoChain);
    }
});

const genres = {};
// used to cache data like the help command, so that resources aren't wasted generating it again
// it isn't persistent, so data like the help command will get regenerated (good for if a new command is added/modified)
const commandData = {};
const commands = [
    //help
    new Command("bot/support", "help", "lists all commands", async function (message, parameters) {
        var response = "";
        if (commandData["response"]) {
            response = commandData["response"];
        } else {
            function addToHelp(com) {
                response += `$${com.commandName} (`;
                for (var i = 0; i < com.params.length; i++) {
                    var name = com.params[i].name;
                    response += i === com.params.length - 1 ? name : `${name}, `;
                }
                response += `) : ${com.desc} \n`;
                if (parameters["paramDescs"]) {
                    for (var i = 0; i < com.params.length; i++) {
                        response += `-${com.params[i].name} : ${com.params[i].desc} \n`;
                    }
                }
            }
            try {
                if (parameters["whichCommand"]) {
                    addToHelp(commands.find(x => x.commandName === parameters["whichCommand"]));
                } else {
                    commands.forEach(x => addToHelp(x));
                }
            } catch (error) {
                message.replyTo(`${parameters["whichCommand"]} is NOT a command. try again :/`)
            }
            commandData["response"] = response;
        }
        
        message.replyTo(response);
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
        new Param("debugMode", "idk what this does yet lol", false),
    ], []),

    // math
    new Command("general/fun", "math", "does the math put in front of it", async function (message, parameters) {
        try {
            message.replyTo(String(evaluate(parameters["equation"])));
        } catch (error) {
            message.replyTo(error);
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], []),

    // eval
    new Command("general/fun", "eval", "astrl only!! runs javascript code from a string", async function (message, parameters) {
        try {
            let code = eval(parameters["code"])
            if (code.toString() === '[object Promise]') {
                code.then(result => {
                    if (parameters["return"] && result) {
                        if (result.toString().length <= 4000) {
                            message.replyTo(String(result));
                        } else {
                            message.replyTo("the result was too long to display, but the code was still ran.");
                        }
                    } else {
                        message.react('✅');
                    }
                });
            } else if (code) {
                message.replyTo(String(code));
            }
        } catch (error) {
            message.replyTo(String(error));
        }
    }, [
        new Param("code", "the code to run", ""),
        new Param("return", "should the ", true),
    ], ["438296397452935169"]),

    // echo
    new Command("general/fun", "echo", "echoes whatever's in front of it", async function (message, parameters) {
        try {
            await sleep(convertTime(parameters["waitValue"], parameters["waitType"], 'ms'));
            message.channel.send(parameters["reply"]);
            if (parameters["delete"]) message.delete();
        } catch (error) {
            message.channel.send(error);
        }
    }, [
        new Param("reply", "the message to echo back to you", "..."),
        new Param("waitValue", "the time it will take to echo back your message", 0),
        new Param("waitType", "i.e ms (milliseconds), s (seconds), m (minutes)", 's'),
        new Param("delete", "deletes message after sending", false),
    ], []),

    // mock
    new Command("general/fun", "mock", "mocks text/whoever you reply to", async function (message, parameters) {
        let reference;
        try {
            reference = await message.fetchReference();
            await message.delete();
        } catch (error) {
            await message.delete();
            reference = await message.channel.messages.fetch({ limit: 1 });
            reference = reference.first();
        }

        const mock = [];
        for (let i = 0; i < reference.content.length; i++) {
            let vary = i % 2 == 0;
            // if (parameters["variance"] !== 0) {
            //     let vary = i % 2 == 0;
            // }

            // let vary;
            // if (mock[i - 1] === mock[i - 1].toLowerCase()) {
            //     vary = ;
            // }
            mock.push(vary ? reference.content[i].toLowerCase() : reference.content[i].toUpperCase());
        }
        reference.replyTo(mock.join(''));
    }, [
        new Param("reply", "the message to mock", ""),
        new Param("variance", "the amount of variance in the mocking (INITIALIZATION ONLY)", 0),
    ], []),

    // true
    new Command("general/fun", "true", "<:true:1149936632468885555>", async function (message, parameters) {
        let reference;
        try {
            reference = await message.fetchReference();
            await message.delete();
        } catch {
            await message.delete();
            reference = await message.channel.messages.fetch({ limit: 1 });
            reference = reference.first();
            console.log(reference);
        }
        
        for (let i = 0; i < Math.min(parameters["amount"], bigData.trueEmojis.length); i++) {
            await reference.react(bigData.trueEmojis[i]);
        }
    }, [
        new Param("amount", `the amount you agree with this statement (capped at ${bigData.trueEmojis.length})`, bigData.trueEmojis.length),
    ], []),

    // jerma
    new Command("general/fun", "jerma", "sets the current channel to be the channel used for counting", async function (message, parameters) {
        switch (parameters["fileType"]) {
            case 0: {
                let reaction = await message.react('✅');
                try {
                    if (!scpClient) scpClient = await scp.Client(remote_server);
                    if (!jermaFiles) jermaFiles = await scpClient.list('/home/opc/mediaHosting/jermaSFX/');
                    console.log(jermaFiles);

                    let result = `./temp/${parameters["fileName"]}.mp3`;
                    let index = Math.round(Math.random() * jermaFiles.length - 1);
                    await scpClient.downloadFile(`/home/opc/mediaHosting/jermaSFX/${jermaFiles[index].name}`, result);
                    await message.channel.send({ files: [result] });
                    fs.unlink(result, function(){});
                } catch (error) {
                    console.error(error);
                    message.react('❌');
                    reaction.remove().catch(error => console.error('Failed to remove reactions:', error));
                }
                
            } break;
            case 1: {
                if (!jermaClips) {
                    jermaClips = await google.youtube('v3').playlistItems.list({
                        auth: authenticate({ key: config.ytApiKey, type: "key" }),
                        part: [ 'id', 'snippet' ], playlistId: 'PLBasdKHLpmHFYEfFCc4iCBD764SmYqDDj', maxResults: 500,
                    });
                    jermaClips = jermaClips.data.items;
                }
                console.log(jermaClips.length);
                let index = Math.round(Math.random() * jermaClips.length - 1);
                console.log(jermaClips[index]);
                message.replyTo(`[${jermaClips[index].snippet.title}](https://www.youtube.com/watch?v=${jermaClips[index].snippet.resourceId.videoId})`);
            } break;
            default:
                message.replyTo(`type "${parameters["fileType"]}" not supported!`);
                break;
        }

        function err(message, error) {
            message.react('✅');
            console.log(error);
        }
    }, [
        new Param("fileType", "the type of jerma file (INITIALIZATION ONLY)", 0),
        new Param("fileName", "the name of the resulting file", "jerma so silly"),
    ], []),

    // countHere
    new Command("patterns/counting", "countHere", "sets the current channel to be the channel used for counting", async function (message, parameters) {
        let channelId = parameters["channel"] ? parameters["channel"] : message.channel.id;
        let isChannel = count.channel === channelId;

        count.channel = isChannel ? "" : channelId;
        await client.channels.fetch(channelId)
            .then(x => x.send(isChannel ? 'counting in this channel has ceased.' : 'alright. start counting then.'))
            .catch(err => console.error(err));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], ["438296397452935169"]),

    // resetCount
    new Command("patterns/counting", "resetCount", "resets the current count", async function (message, parameters) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], ["438296397452935169"]),

    // chainHere
    new Command("patterns/chaining", "chainHere", "sets the current channel to be the channel used for message chains", async function (message, parameters) {
        let channelId = parameters["channel"] ? parameters["channel"] : message.channel.id;
        let isChannel = chain.channel === channelId;

        chain.channel = isChannel ? "" : channelId;
        await client.channels.fetch(channelId)
            .then(x => x.send(isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.'))
            .catch(e => message.replyTo(e));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], ["438296397452935169"]),

    // autoChain
    new Command("patterns/chaining", "autoChain", "will let any channel start a chain", async function (message, parameters) {
        chain.autoChain = parameters["howMany"];
        message.replyTo(`autoChain is now ${chain.autoChain}.`);
    }, [new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)], ["438296397452935169"]),

    // kill
    new Command("bot", "kill", "kills the bot", async function (message, parameters) {
        await message.channel.send('bot is now dead 😢');
        await kill();
    }, [],
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),
];
const commandsObj = {
    //help
    "help" : new Command("bot/support", "lists all commands", async function (message, parameters) {
        var response = "";
        function addToHelp(com) {
            let paramNames = Array.from(com.params, x => x.name)
            response += `$${com.commandName} (${paramNames.join(', ')}) : ${com.desc} \n`;
            
            if (parameters["paramDescs"]) {
                let test = [];
                com.params.forEach(x => test.push(`-${x.name} : ${x.desc}`));
                test = test.join('\n');
                // for (var i = 0; i < com.params.length; i++) {
                //     response += `-${com.params[i].name} : ${com.params[i].desc} \n`;
                // }
            }
        }
        try {
            if (parameters["whichCommand"]) {
                addToHelp(commands[parameters["whichCommand"]]);
            } else {
                if (commandData["response"]) {
                    response = commandData["response"];
                } else {
                    Object.keys(commandsObj).forEach(key => addToHelp(commandsObj[key]));
                    commandData["response"] = response;
                }
                
            }
        } catch (error) {
            if (commandsObj.hasOwnProperty(parameters["whichCommand"]))
            message.replyTo(`${parameters["whichCommand"]} is NOT a command. try again :/`)
        }
        
        
        message.replyTo(response);
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
        new Param("debugMode", "idk what this does yet lol", false),
    ], []),

    // math
    "math" : new Command("general/fun", "does the math put in front of it", async function (message, parameters) {
        try {
            message.replyTo(String(evaluate(parameters["equation"])));
        } catch (error) {
            message.replyTo(error);
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], []),

    // eval
    "eval" : new Command("general/fun", "astrl only!! runs javascript code from a string", async function (message, parameters) {
        try {
            let code = eval(parameters["code"])
            if (code.toString() === '[object Promise]') {
                code.then(result => {
                    if (parameters["return"] && result) {
                        if (result.toString().length <= 4000) {
                            message.replyTo(String(result));
                        } else {
                            message.replyTo("the result was too long to display, but the code was still ran.");
                        }
                    } else {
                        message.react('✅');
                    }
                });
            } else if (code) {
                message.replyTo(String(code));
            }
        } catch (error) {
            message.replyTo(String(error));
        }
    }, [
        new Param("code", "the code to run", ""),
        new Param("return", "should the ", true),
    ], ["438296397452935169"]),

    // echo
    "echo" : new Command("general/fun", "echoes whatever's in front of it", async function (message, parameters) {
        try {
            await sleep(convertTime(parameters["waitValue"], parameters["waitType"], 'ms'));
            message.channel.send(parameters["reply"]);
            if (parameters["delete"]) message.delete();
        } catch (error) {
            message.channel.send(error);
        }
    }, [
        new Param("reply", "the message to echo back to you", "..."),
        new Param("waitValue", "the time it will take to echo back your message", 0),
        new Param("waitType", "i.e ms (milliseconds), s (seconds), m (minutes)", 's'),
        new Param("delete", "deletes message after sending", false),
    ], []),

    // kill
    "kill" : new Command("bot", "kills the bot", async function (message, parameters) {
        await message.channel.send('bot is now dead 😢');
        await kill();
    }, [],
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),
}

// Log in to Discord with your client's token
client.login(config.token);