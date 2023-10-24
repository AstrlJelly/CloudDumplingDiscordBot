// Require the necessary discord.js classes
// @ts-check
const bigData = require('./bigData.json');
const process = require('node:process');
const config = require('./private/config.json');
const scp = require('node-scp');
const fs = require('fs');
const dc = require('discord.js');
const brain = require('brain.js');
const { wordsToNumbers } = require('words-to-numbers');
// @ts-ignore idk why this isn't importing correctly, but the code using it works fine
const { authenticate } = require('youtube-api');
const { google } = require('googleapis');
const { evaluate, random } = require('mathjs');

// create a new discord client instance
const client = new dc.Client({
    intents: Array.from(bigData.intents, x => dc.GatewayIntentBits[x])
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

let dontPersist = true;

// used to reinstate timeouts when the bot is restarted
const allTimeouts = [];

function makeReply(content= '', ping = false, files = ['']) {
    try {
        if (typeof content !== typeof String) content = content.toString();
        var replyObj = { content: content, allowedMentions: { repliedUser: ping } };
        var length = replyObj.content.length;
        if (length === 0) {
            replyObj.content = "can't send an empty message!";
        } else if (length > 2000) {
            replyObj.content = replyObj.content.slice(0, 2000 - (length.toString().length + 12)) + ` + ${length} more...`
        }
        if (files.length[0]) replyObj.files = files;
        return replyObj;
    } catch (error) {
        console.error(error);
        return { content : '' };
    }
}

/**
 * @param {number} ms
 * @param {boolean} [name]
 */
async function sleep(ms, name, push = true) {
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
    if (dontPersist) return;
    fs.writeFile("./persistence/users.json", JSON.stringify({
        _s : _s,
        _u : _u,
        // timeouts : allTimeouts,
    }), err => {
        if (err) return console.error(err);
        
        var date = new Date();
        var times = [ date.getHours(), date.getMinutes(), date.getSeconds() ];
        var timeText = [];
        for (var i = 0; i < times.length; i++) {
            timeText.push(times[i].toString());
            if (timeText[i].length < 2) timeText[i] = "0" + timeText[i];
        }
        console.info(`The file was saved! (${timeText.join(':')})`);
    });
}

async function load() {
    if (dontPersist) return;
    fs.readFile("./persistence/users.json", 'utf-8', async (err, data) => {
        try {
            let dataObj = JSON.parse(data);
            // let dataKeys = Object.keys(dataObj)
            // for (var i = 0; i < dataKeys.length; i++) {
            //     console.log(eval(`${dataKeys[i]} = dataObj.key`));
            // }
            _s = dataObj._s;
            _u = dataObj._u;
            // if (allTimeouts.length) ;

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

function getServer(param) {
    var guild;
    try {
        guild = param.guild.id;
    } catch (error) {
        guild = param;
    }

    return _s[guild];
}

// convertTime() will mean you can convert from seconds to minutes, hours to ms, minutes to days, etc.
// for now it defaults to milliseconds
/**
 * @param {any} time
 * @param {string} typeTo
 */
function convertTime(time, typeTo, typeFrom = 'ms') {
    let typeFromNum = typeNum(typeFrom);
    let typeToNum = typeNum(typeTo);
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

    if (typeFromNum === typeToNum) return time;

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
    /**
     * @param {string} genre
     * @param {string} desc
     * @param {function} func
     */
    constructor(genre, desc, func, params = [], limitedTo = []) {
        this.genre = genre;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
    }
}

class Param {
    /**
     * @param {string} name
     * @param {string} desc
     * @param {string | number | boolean} preset
     */
    constructor(name, desc, preset) {
        this.name = name;
        this.desc = desc;
        this.preset = preset;
    }
}

let sillyObj = {
    "391459218034786304" : true, // untitled
    "999020930800033876" : true, // raffy
}

let _s = {
    "default" : {
        count : { // default counting variables
            channel : null,
            current: 0,      // the last number said that was correct
            prevNumber: 0,   // used to reset back to the last number if i messed up my code
            highestNum: 0,   // the highest number ever gotten to
            lastCounter: "", // used to check for duplicates
        },
        
        chain : { // default chain variables
            channel: null,
            current: "",     //
            chainLength: 0,  //
            prevChain: "",   // used to reset back to the last chain if i messed up my code
            lastChainer: "", // used to check for duplicates
            autoChain: 0,    // the amount of messages in any channel to start a chain
        }
    },
};
let _u = {};

process.on('SIGINT', async () => {
    await kill();
});

/**
 * @param {dc.Message<boolean>} message
 */
async function resetNumber(message, reply = 'empty. astrl screwed up lol', react = '💀') {
    let count = _s[message.guildId].count;
    if (count.currentNum > count.highestNum) count.highestNum = count.currentNum;
    count.lastCounter = '';
    count.prevNumber = count.currentNum;
    count.currentNum = 0;
    await message.react(react);
    await message.reply(makeReply(reply));
}

/**
 * @param {dc.Message<boolean>} message
 * @param {string | number} inRow
 */
function chainFunc(message, inRow) {
    console.log("first " + inRow);
    let chain = _s[message.guildId].chain;
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
    client.guilds.cache.forEach(guild => {
        if (!_s.hasOwnProperty(guild.id)) {
            _s[guild.id] = _s["default"];
        }
    })
});

client.on(dc.Events.MessageCreate, async message => {
    // if (!counts || !chains) {
    //     counts[message.guildId] = ;
    //     chains[message.guildId] = ;
    // }
    //if (message.author.id !== "438296397452935169") return; // testing mode :)
    if (message.author.bot) return;
    var cont = message.content;

    var commandFromMessage = cont.split(' ')[0].substring(config.prefix.length);

    if (cont.startsWith(config.prefix) && commands[commandFromMessage]) {
        if (sillyObj.hasOwnProperty(message.author.id) && Math.random() < 0.995) {
            message.reply(makeReply(await commands["mock"].func(message, {}, false)));
            return;
        }
        var com = commands[commandFromMessage];
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
            com.params.forEach((/** @type {{ name: PropertyKey; preset: any; }} */ x) => {
                if (!paramObj.hasOwnProperty(x.name)) {
                    paramObj[x.name] = x.preset;
                }
            });

            try {
                await com.func(message, paramObj);
            } catch (error) {
                message.reply(makeReply(error, false));
            }
        } else {
            await message.reply(makeReply('hey, you can\'t use this command!'));
        }
        return;
    }

    if (message.channel.id === getServer(message).count.channel) {
        var num = 0;
        var content = String(wordsToNumbers(message.content));

        try {
            num = evaluate(content);
        } catch (error) {
            if (!Number(content[0])) console.error(error);
            return;
        }
        
        if (getServer(message).count.lastCounter === message.author.id) {
            resetNumber(message, 'uhhh... you know you can\'t count twice in a row, right??');
            return;
        }

        if (num == getServer(message).count.currentNum + 1) {
            message.react('✅');
            getServer(message).count.lastCounter = message.author.id;
            getServer(message).count.currentNum++;
        } else {
            resetNumber(message, (getServer(message).count.prevNumber < 10) ?
                'you can do better than THAT...' :
                'you got pretty far. but i think you could definitely do better than ' + getServer(message).count.highestNum + '.'
            );
        }
    } else if (message.channel.id === getServer(message).chain.channel) {
        chainFunc(message, 3);
    } else if (getServer(message).chain.autoChain >= 0) {
        //chainFunc(message, chain.autoChain);
    }
});

const genres = {};
// used to cache data like the help command, so that resources aren't wasted generating it again
// it isn't persistent, so data like the help command will get regenerated (good for if a new command is added/modified)
const commandData = {};
const commands = {
    "help" : new Command("bot/support", "lists all commands", async function (message, p) {
        var response = [];
        
        function addToHelp(key) {
            var com = commands[key];
            var paramNames = Array.from(com.params, x => x.name);

            response.push(`$${key} (${paramNames.join(', ')}) : ${com.desc}\n`);
            
            if (p["paramDescs"]) {
                var test1 = [];
                com.params.forEach(x => test1.push(`-${x.name} : ${x.desc}`));
                response.push(test1.join('\n'));
                // for (var i = 0; i < com.params.length; i++) {
                //     response += `-${com.params[i].name} : ${com.params[i].desc} \n`;
                // }
            }
        }

        if (p["debug"]) {
            try {
                message.reply(makeReply(eval(`commands["${p["whichCommand"]}"].${p["debug"]}.toString();`)));
            } catch (error) {
                message.reply(makeReply("ermm... try again bucko"));
            }
        } else {
            try {
                console.log(Boolean(p["whichCommand"]));
                if (Boolean(p["whichCommand"])) {
                    addToHelp(p["whichCommand"]);
                } else {
                    Object.keys(commands).forEach(key => addToHelp(key));
                    // if (commandData["response"]) {
                    //     response = commandData["response"];
                    // } else {
                    //     Object.keys(commands).forEach(key => addToHelp(commands[key]));
                    //     console.log("test")
                    //     commandData["response"] = response;
                    // }
                }
                console.log(`commands["${p["whichCommand"]}"].${p["debug"]}`);
                message.reply(makeReply(response.join('')));
            } catch (error) {
                if (commands.hasOwnProperty(p["whichCommand"]))
                message.reply(makeReply(`${p["whichCommand"]} is NOT a command. try again :/`))
            }
        }
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
        new Param("debug", "gets the specific component of a command", ""),
    ], []),

    "math" : new Command("general/fun", "does the math put in front of it", async function (message, parameters) {
        try {
            message.reply(makeReply(String(evaluate(parameters["equation"]))));
        } catch (error) {
            message.reply(makeReply(error));
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], []),

    "eval" : new Command("general/fun", "astrl only!! runs javascript code from a string", async function (message, parameters) {
        try {
            let code = eval(parameters["code"])
            if (code.toString() === '[object Promise]') {
                code.then(result => {
                    if (parameters["return"] && result) {
                        if (result.toString().length <= 4000) {
                            message.reply(makeReply(result));
                        } else {
                            message.reply(makeReply("the result was too long to display, but the code was still ran."));
                        }
                    } else {
                        message.react('✅');
                    }
                });
            } else if (code) {
                message.reply(makeReply(code));
            }
        } catch (error) {
            message.reply(makeReply(error));
        }
    }, [
        new Param("code", "the code to run", ""),
        new Param("return", "should the ", true),
    ], ["438296397452935169"]),

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

    "mock" : new Command("general/fun", "mocks text/whoever you reply to", async function (message, parameters, del = true) {
        let reference;
        try {
            reference = await message.fetchReference();
            if (del) await message.delete();
        } catch (error) {
            if (del) await message.delete();
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
        reference.reply(makeReply(mock.join('')));
    }, [
        new Param("reply", "the message to mock", ""),
        new Param("variance", "the amount of variance in the mocking (INITIALIZATION ONLY)", 0),
    ], []),

    "true" : new Command("general/fun", "<:true:1149936632468885555>", async function (message, parameters) {
        let reference;
        try {
            reference = await message.fetchReference();
            await message.delete();
        } catch {
            await message.delete();
            reference = await message.channel.messages.fetch({ limit: 1 });
            reference = reference.first();
        }
        
        for (let i = 0; i < Math.min(parameters["amount"], bigData.trueEmojis.length); i++) {
            await reference.react(bigData.trueEmojis[i]);
        }
    }, [
        new Param("amount", `the amount you agree with this statement (capped at ${bigData.trueEmojis.length})`, bigData.trueEmojis.length),
    ], []),

    "jerma" : new Command("general/fun", "sets the current channel to be the channel used for counting", async function (message, parameters) {
        switch (parameters["fileType"]) {
            case 0: {
                let reaction = message.react('✅');
                try {
                    if (!scpClient) scpClient = await scp.Client(remote_server);
                    if (!jermaFiles) jermaFiles = await scpClient.list('/home/opc/mediaHosting/jermaSFX/');

                    let result = `./temp/${parameters["fileName"]}.mp3`;
                    let index = Math.round(Math.random() * jermaFiles.length - 1);
                    await scpClient.downloadFile(`/home/opc/mediaHosting/jermaSFX/${jermaFiles[index].name}`, result);
                    await message.channel.send({ files: [result] });
                    fs.unlink(result, function(){});
                } catch (error) {
                    console.error(error);
                    message.react('❌');
                    reaction.remove().catch((/** @type {any} */ error) => console.error('Failed to remove reactions:', error));
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
                let index = Math.round(Math.random() * jermaClips.length - 1);
                message.reply(makeReply(`[${jermaClips[index].snippet.title}](https://www.youtube.com/watch?v=${jermaClips[index].snippet.resourceId.videoId})`));
            } break;
            default:
                message.reply(makeReply(`type "${parameters["fileType"]}" not supported!`));
                break;
        }
    }, [
        new Param("fileType", "the type of jerma file (INITIALIZATION ONLY)", 0),
        new Param("fileName", "the name of the resulting file", "jerma so silly"),
    ], []),

    "convertTime" : new Command("general/fun", "converts time", async function(message, parameters) {
        // try {
        //     let p = parameters;
        //     message.reply(p[""], p[""], p[""], p[""])
        // } catch (error) {
            
        // }
        message.reply(makeReply(commands["convertTime"].func.toString()))
    }, [
        new Param("timeFromValue", "", 0),
        new Param("timeFromType", "", "s"),
        new Param("timeToValue", "", 0),
        new Param("timeToType", "", "s"),
    ]),

    "countChannel" : new Command("patterns/counting", "sets the current channel to be the channel used for counting", async function (message, parameters) {
        let channel = message.channel;
        if (parameters["channel"]) {
            try {
                channel = await client.channels.fetch(parameters["channel"]);
            } catch (error) {
                try {
                    channel = await message.guild.channels.cache.find(channel => channel.name.toLowerCase() === parameters["channel"].toLowerCase());
                } catch (error) {
                    await message.react('❌');
                    return;
                }
            }
        }
        message.react('✅');

        if (channel.id === getServer(channel).count.channel.id) {
            channel.send(`counting in ${channel.name.toLowerCase()} has ceased.`);
            getServer(channel).count.channel = null;
        } else {
            channel.send(`alright, count in ${channel.name.toLowerCase()}!`);
            getServer(channel).count.channel = channel;
        }
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], ["438296397452935169"]),

    "resetCount" : new Command("patterns/counting", "resets the current count", async function (message, parameters) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], ["438296397452935169"]),

    "chainHere" : new Command("patterns/chaining", "sets the current channel to be the channel used for message chains", async function (message, parameters) {
        let channel = message.channel;
        if (parameters["channel"]) {
            try {
                channel = await client.channels.fetch(parameters["channel"]);
            } catch (error) {
                try {
                    channel = await message.guild.channels.cache.find(channel => channel.name.toLowerCase() === parameters["channel"].toLowerCase());
                } catch (error) {
                    await message.react('❌');
                    return;
                }
            }
        }
        message.react('✅');

        if (channel.id === getServer(channel).count.channel.id) {
            channel.send(`counting in ${channel.name.toLowerCase()} has ceased.`);
            getServer(channel).count.channel = null;
        } else {
            channel.send(`alright, count in ${channel.name.toLowerCase()}!`);
            getServer(channel).count.channel = channel;
        }

        // old stuff here
        let channelId = parameters["channel"] ? parameters["channel"] : message.channel.id;
        let isChannel = getServer(message).chain.channel === channelId;

        getServer(message).chain.channel = isChannel ? "" : channelId;
        await client.channels.fetch(channelId)
            .then(x => x.send(isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.'))
            .catch(e => message.replyTo(e));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [ "438296397452935169" ]),

    "autoChain" : new Command("patterns/chaining", "will let any channel start a chain", async function (message, parameters) {
        getServer(message).chain.autoChain = parameters["howMany"];
        message.replyTo(`autoChain is now ${getServer(message).chain.autoChain}.`);
    }, [
        new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)
    ], [ "438296397452935169" ]),

    "sanityCheck" : new Command("bot", "checks the parameters of each command to see if any overlap", async function(message, parameters) {
        var overlaps = [];
        for (var com in commands) {
            console.log(commands[com]);
            var params = commands[com].params;
            params.forEach(x => {
                params.forEach(y => {
                    if (x.name === y.name && x !== y) {
                        overlaps.push(`${x.name} (preset : ${x.preset}) : ${x.desc}`);
                    }
                });
            });
        }
        if (overlaps.length > 0) {
            message.reply(makeReply("overlaps:\n" + overlaps.join('\n') +"\nastrl u dumbass"))
        } else {
            message.reply(makeReply("no overlaps here! wow isn't astrl such a good programmer <:smide:1136427209041649694>"))
        }
    }, [
        // new Param("doubleUp", "desription on", 52),
        // new Param("doubleUp", "descirtpn dos", "this is a default"),
    ]),

    "send" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message, parameters) {
        try {
            var channel = client.channels.cache.get(parameters["channel"]);
            await channel.send(makeReply(parameters["message"]));
        } catch (error) {
            message.reply(makeReply("dumbass\n"+error))
        }
    }, [
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel
        new Param("message", "the message to send into the channel", "uh"),
    ],
    [
        "438296397452935169",
    ]),

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