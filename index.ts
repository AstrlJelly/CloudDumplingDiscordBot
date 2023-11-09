// Require the necessary discord.js classes
// @ts-ignore
import config from './private/config.json';
import process from 'node:process';
import fs from 'fs';
import scp from 'node-scp';
import dc from 'discord.js';
import brain from 'brain.js';
const mathjs = require('mathjs');
import { wordsToNumbers } from 'words-to-numbers';
import authenticate from 'youtube-api';
import { google } from 'googleapis';

const client = new dc.Client({ // create a new discord client instance
    intents: Array.from(getBigData().intents, (x : string) => dc.GatewayIntentBits[x])
});

const trustedUsers : string[] = [ // only add to this if you FULLY TRUST THEM
    "438296397452935169", // astrl (me)
    "820357014831628309", // @12u3ie
];

const allTimeouts = []; // used to reinstate timeouts when the bot is restarted

const dontPersist = false;

function getBigData() {
    if (fs.existsSync("./bigData.json")) {
        return JSON.parse(fs.readFileSync("./bigData.json", 'utf-8')); 
    }
}

// scp client, currently just for grabbing
let remote_server = {
    host: '150.230.169.222',
    port: 22,
    username: 'opc',
}
if (fs.existsSync("./private/ssh.key")) {
    remote_server["privateKey"] = fs.readFileSync('./private/ssh.key');
}

let jermaFiles, jermaClips;
let scpClient;

function makeReply(content : string, ping = false, files = ['']) {
    try {
        if (typeof content !== typeof String) content = content.toString();
        var length = content.length;
        if (length === 0) {
            content = "can't send an empty message!";
        } else if (length > 2000) {
            content = content.slice(0, 2000 - (length.toString().length + 12)) + ` + ${length} more...`
        }
        var replyObj = { content: content, allowedMentions: { repliedUser: ping } };
        if (files.length[0]) replyObj["files"] = files;
        return replyObj;
    } catch (error) {
        console.error(error);
        return { content : "guh" };
    }
}

// dc.Message.prototype.replyTo = function(reply : string, ping : boolean, files : string[]) {
//     return this.reply()
// }

// this function had a "name" parameter but i have no clue what it does 
async function sleep(ms : number, push : boolean = true) {
    var t = new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
        if (push) allTimeouts.push({ 
            timeout : t,
            startTime : Date.now(),
            // name : name,
        });
    });
    return t;
}

async function autoSave() {
    await sleep(60000, false);
    console.log("Autosaving...");
    await save().catch(error => console.error("Autosave failed!\n" + error));
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
    let dataObj = {};
    if (fs.existsSync("./persistence/users.json")) {
        fs.readFile("./persistence/users.json", 'utf-8', async (err, data) => {
            try {
                dataObj = JSON.parse(data)._s;
                console.info("The file was loaded!");
            } catch (error) {
                console.error(error);
            }
        }); 
    }
    
    client.guilds.cache.forEach(guild => {
        console.log ("server with id " + guild.id + " has the object : " + JSON.stringify(dataObj[guild.id]))
        if (!dataObj.hasOwnProperty(guild.id)) { // if there's no server object
            console.log("guild with id \"" + guild.id + "\" set to default");
            _s[guild.id] = _s["default"];
        } else {                            // if there is a server object
            console.log("LOADED guild with id \"" + guild.id + "\"");
            _s[guild.id] = dataObj[guild.id];
        }
    })
}

async function kill() {
    await save();
    await client.destroy();
    process.exit();
}

/** @param {{ guildId: String; }} param */
function getServer(param) {
    return _s[param];
}

function currentTime() {
    var parse = Math.round(performance.now() * 1000) / 1000
    return parse;
}

// convertTime() will mean you can convert from seconds to minutes, hours to ms, minutes to days, etc.
// for now it defaults to milliseconds
function convertTime(time = 0, typeTo = 's', typeFrom = 'ms') {
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
    genre : string
    desc: string
    func : { (message: any, p: any): Promise<void> };
    params : Param[]
    limitedTo: string[]
    inf: boolean
    timeout: Number
    constructor(genre, desc, func, params = [], limitedTo = [], inf = false, timeout = 0) {
        this.genre = genre;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
        this.inf = inf;
        this.timeout = timeout;
    }
}

class Param {
    name: string
    desc: string
    preset: string | number | boolean
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
        },

        convo : {
            convoChannel: null, // the channel people are speaking in
            replyChannel: null, // the channel where you reply to the people speaking
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
});

client.on(dc.Events.MessageCreate, async message => {
    // if (!counts || !chains) {
    //     counts[message.guildId] = ;
    //     chains[message.guildId] = ;
    // }
    // if (message.author.id !== "438296397452935169") return; // testing mode :)
    if (message.author.bot) return;


    var commandFromMessage = message.content.split(' ')[0].substring(config.prefix.length);

    // #region command handler
    if (message.content.startsWith(config.prefix) && commands.hasOwnProperty(commandFromMessage)) {
        if (sillyObj.hasOwnProperty(message.author.id) && Math.random() < 0.99) {
            // await commands["mock"].func(message, { "message" : message.id }, false);
            message.reply("huh? speak up next time buddy.")
            return;
        }
        await parseCommand(message, message.content, commandFromMessage, commands);
        return;
    }
    // #endregion

    // #region counting and chain handler
    let count = _s[message.guildId].count;

    if (message.channel.id === count.channel?.id) {
        var num = 0;
        var content = String(wordsToNumbers(message.content));

        try {
            num = mathjs.evaluate(content);
        } catch (error) {
            if (Number(content[0])) {
                var chars = [];
                var i = 0;
                while (!isNaN(parseInt(content[i])) && i < 50) {
                    chars.push(content[i]);
                    i++;
                }
                num = mathjs.evaluate(chars.join(''));
            } else return;
        }
        
        // if (count.lastCounter === message.author.id) {
        //     resetNumber(message, 'uhhh... you know you can\'t count twice in a row, right??');
        //     return;
        // }

        if (num == count.current + 1) {
            message.react('✅');
            count.lastCounter = message.author.id;
            count.current++;
            console.log("count current : " + _s[message.guildId].count.current);
        } else {
            resetNumber(message, (count.prevNumber < 10) ?
                'you can do better than THAT...' :
                'you got pretty far. but i think you could definitely do better than ' + count.highestNum + '.'
            );
        }
    } else if (message.channel.id === _s[message.guildId].chain.channel) {
        chainFunc(message, 3);
    } else if (_s[message.guildId].chain.autoChain >= 0) {
        //chainFunc(message, chain.autoChain);
    }
    if (_s[message.guildId].convo.convoChannel?.id == message.channel.id) {
        var reply = `${message.author.displayName}[:](${message.url})`
        var replyChannel = _s[message.guildId].convo.replyChannel;
        var files = [];
        console.log("print before")
        if (message.attachments.size > 0) {
            message.attachments.forEach(async x => {
                files.push(await fetch(x.url));
            });
            console.log("print middle")
        }
        console.log("print after")
        replyChannel.send({
            content : reply,
            // allowedMentions: { repliedUser: message.mentions.members?.size !== 0 },
            files: files
        })
        
    } else if (_s[message.guildId].convo.replyChannel?.id == message.channel.id) {
        console.log(message.content);
        _s[message.guildId].convo.convoChannel.send(message.content);
    }
    // #endregion
});

/**
 * @param {dc.Message<boolean>} message
 * @param {string} content
 * @param {string} command
 * @param {object} comms
 */
async function parseCommand(message, content, command, comms)
{
    if (!comms.hasOwnProperty(command)) {
        console.error("nope. no " + command + " here");
        return;
    }
    var timeBefore = currentTime();
    var com = comms[command];
    if (com.limitedTo.length === 0 || com.limitedTo.includes(message.author.id) || trustedUsers.includes(message.author.id)) {
        // #region parameter stuff
        var paramObj = {};
        const space = '|'; // for consistency; will always use the same character(s) for replacing spaces
        var tempParameters;
        if (content.indexOf(' ') > -1) {
            var sections = content.split('"');
            if (content.indexOf('"') > -1) {
                for (var i = 0; i < sections.length; i++) {
                    if (i % 2 == 1 && sections[i].indexOf(' ') > -1) {
                        sections[i] = sections[i].split(' ').join(space);
                    }
                }
            }
            tempParameters = sections.join('').split(' ');
            tempParameters.shift();

            var j = 0;
            for (var i = 0; i < com.inf ? Math.min(tempParameters.length, com.params.length) : tempParameters.length; i++) {
                // god i miss conditional statements
                function convParam(param, content) {
                    var preset = (typeof param.preset).toLowerCase();
                    switch (preset) {
                        case "string": return String(content);
                        case "number": return Number(content);
                        case "boolean": return (content.toLowerCase() == "true");
                        default:
                            console.error(`uh oh!! that's not real.\ntype of ${preset} on parameter ${param.name} of command ${com.name} is invalid.`)
                            return undefined;
                    }
                }
                // convert space character back to actual spaces, if it needs them
                if (tempParameters[i].indexOf(space) > -1) {
                    tempParameters[i] = tempParameters[i].split(space).join(' ');
                }
                // decides if the current param is being manually set or not, and assigns the paramObj accordingly
                if (tempParameters[i].indexOf(':') > -1) {
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
        // #endregion

        // if parameter is not set, use the preset
        com.params.forEach(x => {
            if (!paramObj.hasOwnProperty(x.name)) {
                paramObj[x.name] = x.preset;
            }
        });

        try {
            var comTime = currentTime();
            console.log(`took ${comTime - timeBefore} milliseconds to complete parsing message`);
            await com.func(message, paramObj);
            console.log(`took ${currentTime() - comTime} milliseconds to finish function`);
            // com.timeout
        } catch (error) {
            message.reply(makeReply(error, false));
        }
    } else {
        await message.reply(makeReply('hey, you can\'t use this command!'));
    }
}

const genres = {};
// used to cache data like the help command, so that resources aren't wasted generating it again
// it isn't persistent, so data like the help command will get regenerated (good for if a new command is added/modified)
const commandData = {};
const commands = {
    "help" : new Command("bot/support", "lists all commands", async function (message, p) {
        var response = [];
        
        function addToHelp(key : string) {
            var com : Command = commands[key];
            var paramNames = Array.from(com.params, x => x.name);

            response.push(`$${key} (${paramNames.join(', ')}) : ${com.desc}\n`);
            
            if (p["paramDescs"]) {
                var test1 = [];
                com.params.forEach(x => test1.push(`-${x.name} : ${x.desc}\n`));
                response.push(test1.join(''));
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
            message.reply(makeReply(String(mathjs.evaluate(parameters["equation"]))));
        } catch (error) {
            message.reply(makeReply(error));
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], []),

    "mathClass" : new Command("general/fun", "this is for school lol", async function (message, parameters) {
        // var nums = parameters["numbers"].split(' ');
        // var feet = [];
        // var inches = [];
        // for (let i = 0; i < nums.length; i++) {
        //     var foot = i % 2 == 0;
        //     (foot ? feet : inches).push(Number (nums[i]));
        // }
        // var newStuff = [];
        // for (let i = 0; i < feet.length; i++) {
        //     var modRad = (((feet[i] * 12) + inches[i]) / (Math.PI * 2));
        //     console.log(modRad);
        //     newStuff.push(String ((4/3) * Math.PI * (Math.pow(modRad, 3))));
        // }

        // message.reply(makeReply(newStuff.join("\n")));
        var nums = parameters["params"].split(' ');
        var feet = [];
        var inches = [];
        for (let i = 0; i < nums.length; i++) {
            var foot = i % 2 == 0;
            (foot ? feet : inches).push(Number (nums[i]));
        }
        var newStuff = [];
        for (let i = 0; i < feet.length; i++) {
            var modRad = (((feet[i] * 12) + inches[i]) / (Math.PI * 2));
            console.log(modRad);
            newStuff.push(String ((4/3) * Math.PI * (Math.pow(modRad, 3))));
        }

        message.reply(makeReply(newStuff.join("\n")));
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], [], true),

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
        async function getMessage() {
            var messages = await message.channel.messages.fetch({ limit: 2 });
            var lastMessage = messages.last() ?? await getMessage();
            return lastMessage;
        }

        let reference = parameters["reply"] !== "" ? message : await (message.reference !== null ? message.fetchReference() : getMessage());
        let toMock    = parameters["reply"] !== "" ? parameters["reply"] : reference.content;

        const mock = [];
        for (let i = 0; i < toMock.length; i++) {
            let vary = i % 2 == 0;
            // if (parameters["variance"] !== 0) {
            //     let vary = i % 2 == 0;
            // }

            // let vary;
            // if (mock[i - 1] === mock[i - 1].toLowerCase()) {
            //     vary = ;
            // }
            mock.push(vary ? toMock[i].toLowerCase() : toMock[i].toUpperCase());
        }
        if (parameters["reply"] === "") {
            reference.reply(makeReply(mock.join('')));
        } else {
            reference.channel.send(makeReply(mock.join('')));
        }

        if (del) await message.delete();
    }, [
        new Param("reply", "the message to mock", ""),
        new Param("variance", "the amount of variance in the mocking (INITIALIZATION ONLY)", 0),
        new Param("message", "the message id to mock", ""),
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
        
        for (let i = 0; i < Math.min(parameters["amount"], getBigData().trueEmojis.length); i++) {
            try {
                await reference.react(getBigData().trueEmojis[i]);
            } catch (error) {
                console.log("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you agree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ], []),

    "false" : new Command("general/fun", "<:false:1123469352826576916>", async function (message, parameters) {
        let reference;
        try {
            reference = await message.fetchReference();
            await message.delete();
        } catch {
            await message.delete();
            reference = await message.channel.messages.fetch({ limit: 1 });
            reference = reference.first();
        }
        
        for (let i = 0; i < Math.min(parameters["amount"], getBigData().trueEmojis.length); i++) {
            try {
                await reference.react(getBigData().trueEmojis[i]);
            } catch (error) {
                console.log("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you disagree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ], []),

    "jerma" : new Command("general/fun", "Okay, if I... if I chop you up in a meat grinder, and the only thing that comes out, that's left of you, is your eyeball, you'r- you're PROBABLY DEAD!", async function (message, parameters) {
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
                    fs.unlink(result, ()=>{}); // lol it looks like a pensi
                } catch (error) {
                    console.error(error);
                    await reaction;
                    await message.reactions.removeAll().catch(error => console.error('Failed to remove reactions:\n', error));
                    message.react('❌');
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
        new Param("fileType", "the type of jerma file", 0),
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

        console.log(_s[message.guildId]);
        let countChannel = _s[message.guildId].count.channel;
        if (countChannel != null && channel.id === countChannel.id) {
            channel.send(`counting in ${channel.name.toLowerCase()} has ceased.`);
            _s[message.guildId].count.channel = null;
        } else {
            channel.send(`alright, count in ${channel.name.toLowerCase()}!`);
            _s[message.guildId].count.channel = channel;
        }
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], ["438296397452935169"]),

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

        if (channel.id === getServer(channel.guildId).count.channel.id) {
            channel.send(`counting in ${channel.name.toLowerCase()} has ceased.`);
            getServer(channel.guildId).count.channel = null;
        } else {
            channel.send(`alright, count in ${channel.name.toLowerCase()}!`);
            getServer(channel.guildId).count.channel = channel;
        }

        // old stuff here
        let channelId = parameters["channel"] ? parameters["channel"] : message.channel.id;
        let isChannel = _s[message.guildId].chain.channel === channelId;

        _s[message.guildId].chain.channel = isChannel ? "" : channelId;
        await client.channels.fetch(channelId)
            //@ts-ignore
            .then(x =>x.send(isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.'))
            .catch(e => message.replyTo(e));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [ "438296397452935169" ]),

    "autoChain" : new Command("patterns/chaining", "will let any channel start a chain", async function (message, parameters) {
        _s[message.guildId].chain.autoChain = parameters["howMany"];
        console.log(_s[message.guildId].chain.autoChain);
        message.reply(makeReply(`autoChain is now ${_s[message.guildId].chain.autoChain}.`));
    }, [
        new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)
    ], [ "438296397452935169" ]),

    "cmd" : new Command("bot", "more internal commands that only astrl can use", async function (message, parameters) {
        var cont = message.content.substring(message.content.indexOf(' ') + 1)
        console.log("cont : " + cont);
        parseCommand(message, cont, cont.split(' ')[0], cmdCommands);
    }, [], [ "438296397452935169" ]),
}

// for more internal purposes; really just for astrl lol
const cmdCommands = {
    "help" : new Command("bot/support", "lists all cmd commands", async function (message, p) {
        var response = [];
        
        function addToHelp(key) {
            var com : Command = cmdCommands[key];
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
                message.reply(makeReply(eval(`cmdCommands["${p["whichCommand"]}"].${p["debug"]}.toString();`)));
            } catch (error) {
                message.reply(makeReply("ermm... try again bucko"));
            }
        } else {
            try {
                console.log(Boolean(p["whichCommand"]));
                if (Boolean(p["whichCommand"])) {
                    addToHelp(p["whichCommand"]);
                } else {
                    Object.keys(cmdCommands).forEach(key => addToHelp(key));
                    // if (commandData["response"]) {
                    //     response = commandData["response"];
                    // } else {
                    //     Object.keys(cmdCommands).forEach(key => addToHelp(cmdCommands[key]));
                    //     console.log("test")
                    //     commandData["response"] = response;
                    // }
                }
                console.log(`cmdCommands["${p["whichCommand"]}"].${p["debug"]}`);
                message.reply(makeReply(response.join('')));
            } catch (error) {
                if (cmdCommands.hasOwnProperty(p["whichCommand"]))
                message.reply(makeReply(`${p["whichCommand"]} is NOT a command. try again :/`))
            }
        }
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
        new Param("debug", "gets the specific component of a command", ""),
    ]),

    "save" : new Command("bot", "saves the bot's data", async (message, parameters) => await save() ),
    "load" : new Command("bot", "loads the bot's data", async (message, parameters) => await load() ),

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
    ]),

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

    "resetCount" : new Command("patterns/counting", "resets the current count", async function (message, parameters) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], ["438296397452935169"]),

    "send" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message, parameters) {
        try {
            var guild = client.guilds.cache.get(parameters["guild"]);
            if (guild !== undefined) {
                var channel = guild.channels.cache.get(parameters["channel"]);
                // @ts-ignore typescript is annoying and will give me an error because of how GuildBasedChannel inherits its functions
                await channel?.send(makeReply(parameters["message"]));
            }
        } catch (error) {
            message.reply(makeReply("dumbass\n"+error))
        }
    }, [
        new Param("message", "the message to send into the channel", "uh"),
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ], [
        "438296397452935169",
    ]),

    "convo" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message, parameters) {
        try {
            var guild = client.guilds.cache.get(parameters["guild"]);
            if (guild !== undefined) {
                var channel = guild.channels.cache.get(parameters["channel"]);
                _s[message.guildId].convo.convoChannel = channel
                _s[message.guildId].convo.replyChannel = message.channel
            }
        } catch (error) {
            message.reply(makeReply("dumbass\n"+error))
        }
    }, [
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ], [
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

    "test" : new Command("bot", "various things astrl will put in here to test node.js", async function (message, parameters) {
        var url = message.attachments.first()?.url;

        message.reply(makeReply(url));
    }, [
        new Param("lol", "just for math class", "")
    ],
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),
}
// Log in to Discord with your client's token
client.login(config.token);