// Require the necessary discord.js classes
// import process from 'node:process';
import fs from 'fs';
import scp from 'node-scp';
import dc from 'discord.js';
// import brain from 'brain.js';
import * as mathjs from 'mathjs';
import authenticate from 'youtube-api';
import { wordsToNumbers } from 'words-to-numbers';
import { google } from 'googleapis';

const config = JSON.parse(fs.readFileSync('./private/config.json', 'utf-8'));
const emojis = JSON.parse(fs.readFileSync('./emojis.json', 'utf-8'));

const client = new dc.Client({ // create a new discord client instance
    intents: Array.from(getBigData().intents, (x : string) => dc.GatewayIntentBits[x])
});

const trustedUsers : string[] = [ // only add to this if you FULLY TRUST THEM
    "438296397452935169", // astrl (me)
    "820357014831628309", // @12u3ie
];

const allTimeouts = []; // used to reinstate timeouts when the bot is restarted

const PERSIST = true;

let bigDataTemp = null;

// exists because i don't want so much data in memory, but 
function getBigData() {
    if (fs.existsSync("./big-data.json")) {
        if (!bigDataTemp) {
            bigDataTemp = JSON.parse(fs.readFileSync("./big-data.json", 'utf-8'))
            wipeBigData();
        }
        return bigDataTemp;

    } else {
        console.error("big-data doesn't exist?!!?!? fix that. now.")
    }
}

async function wipeBigData() {
    await sleep(10000, false);
    bigDataTemp = null;
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

let jermaFiles: string | any[], jermaClips: string | any[];
let scpClient: scp.ScpClient;

// dc.Message.prototype.replyTo = function (content : string, ping : boolean = false, files : string[] = []) {
//     try {
//         if (typeof content !== typeof String) content = content.toString();
//         var length = content.length;
//         if (length === 0) {
//             content = "can't send an empty message!";
//         } else if (length > 2000) {
//             content = content.slice(0, 2000 - (length.toString().length + 12)) + ` + ${length} more...`
//         }
//         var replyObj = { content: content, allowedMentions: { repliedUser: ping } };
//         if (files.length[0]) replyObj["files"] = files;
//         return this.reply(replyObj);
//     } catch (error) {
//         console.error(error);
//         return { content : "guh" };
//     }
// }

function makeReply(content : string, ping = false, files = [''])  {
    try {
        if (typeof content !== typeof String) content = content.toString();
        var length = content.length;
        if (length === 0) {
            content = "can't send an empty message!";
        } else if (length > 2000) {
            // content = content.slice(0, 2000 - (length.toString().length + 12)) + ` + ${length} more...`
        }
        var replyObj = { content: content, allowedMentions: { repliedUser: ping } };
        if (files.length[0]) replyObj["files"] = files;
        return replyObj;
    } catch (error) {
        console.error(error);
        return { content : "guh" };
    }
}

// this function had a "name" parameter but i have no clue what it was supposed to do 
async function sleep(ms : number, push : boolean = true) : Promise<void> {
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
    if (!PERSIST) return;
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
    if (!PERSIST) return;
    let dataObj = {};
    fs.readFile("./persistence/users.json", 'utf-8', async (err, data) => {
        if (!err) {
            try {
                dataObj = JSON.parse(data)._s;
                console.info("The file was loaded!");
            } catch (error) {
                console.error(error);
            }
        }

        console.log(dataObj);
        client.guilds.cache.forEach(guild => {
            if (!dataObj.hasOwnProperty(guild.id)) { // if there's no server object
                console.log("guild with id \"" + guild.id + "\" set to default");
                _s[guild.id] = JSON.parse(JSON.stringify(_s["default"])); // this might be a terrible idea but it Just Works
            } else {                                 // if there is a server object
                console.log("LOADED guild with id \"" + guild.id + "\"");
                _s[guild.id] = dataObj[guild.id];
            }
        })
    });
}

async function kill() {
    await save();
    await client.destroy();
    process.exit();
}

function getServer(param: string) {
    return _s[param];
}

function currentTime() {
    var parse = Math.round(performance.now() * 1000) / 1000
    return parse;
}

// convertTime() will mean you can convert from seconds to minutes, hours to ms, minutes to days, etc.
function convertTime(time = 0, typeFrom = 's', typeTo = 'ms') {
    if (typeTo === typeFrom) return time;

    let modifier = 1;
    var times =    [ 'ms', 's', 'm', 'h', 'd', 'w' ];
    var converts = [ 1000, 60,  60,  24,   7       ];
    let typeFromNum = times.indexOf(typeFrom);
    let typeToNum = times.indexOf(typeTo);

    for (let i = mathjs.min(typeFromNum, typeToNum); i < mathjs.max(typeFromNum, typeToNum); i++) {
        modifier *= converts[i];
    }

    return (typeFromNum > typeToNum) ? (time * modifier) : (time / modifier);
}

class Command {
    genre : string
    desc: string
    func : { (message: dc.Message<boolean>, p: any): Promise<void> };
    params : Param[]
    limitedTo: string[]
    inf: boolean
    timeout: number
    currentTimeout: number
    constructor(genre: string, desc: string, func, params: Param[] = [], limitedTo = [], inf = false, timeout = 0) {
        this.genre = genre;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
        this.inf = inf;
        this.timeout = timeout;
        this.currentTimeout = 0;
    }
}

class Param {
    name: string
    desc: string
    preset: any
    type: any
    constructor(name: string, desc: string, preset: any, type: any = null) {
        this.name = name;
        this.desc = desc;
        this.preset = preset;
        this.type = typeof (type ?? preset);
    }
}

let sillyObj = {
    "391459218034786304" : 0, // untitled
    "999020930800033876" : 0, // raffy
}

let _s = {
    "default" : {
        commands : {},

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
let _u = {
    "default" : {

    }
};

process.on('SIGINT', async () => {
    await kill();
});

async function resetNumber(message: dc.Message<boolean>, reply = 'empty. astrl screwed up lol', react = '💀') {
    let count = _s[message.guildId].count;
    if (count.currentNum > count.highestNum) count.highestNum = count.currentNum;
    count.lastCounter = '';
    count.prevNumber = count.currentNum;
    count.currentNum = 0;
    await message.react(react);
    await message.reply(makeReply(reply));
}

async function chainFunc(message: dc.Message<boolean>, inRow: string | number) {
    console.log("first " + inRow);
    let chain = _s[message.guildId].chain;
    if (!chain.currentChain) {
        chain.currentChain = message.content.toLowerCase();
        chain.chainAmount = 1;
        return;
    }
    if (message.content.toLowerCase() === chain.currentChain && chain.lastChainer !== message.author.id) {
        chain.chainAmount++;
        if (chain.chainAmount >= inRow) await message.react('⛓️');
    } else {
        if (chain.chainAmount >= inRow) await message.react('💔');
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

client.on(dc.Events.MessageCreate, async (message) => {
    // if (message.author.id !== "438296397452935169") return; // testing mode :)
    if (message.author.bot) return;

    var commandFromMessage = message.content.split(' ')[0].substring(config.prefix.length);
    var id = message.author.id;

    if (!_u.hasOwnProperty(id)) {
        _u[id] = JSON.parse(JSON.stringify(_u["default"]));
    }

    // #region command handler
    if (message.content.startsWith(config.prefix) && commands.hasOwnProperty(commandFromMessage)) {
        // 5% chance to happen, if this person is in sillyObj
        if (sillyObj.hasOwnProperty(id) && ( (sillyObj[id] === 0 && mathjs.random()) || sillyObj[id] > 0)) {
            switch (sillyObj[id]) {
                case 0:
                    await message.reply("huh? speak up next time buddy.");
                    sillyObj[id]++;
                    return;
                case 1:
                    if (message.content === message.content.toUpperCase()) {
                        sillyObj[id] = 0;
                    } else {
                        var replies : string[] = [
                            "SPEAK UP!!! CAN'T HEAR YOU!!!!",
                            "dude what did i JUST tell you. ugh.",
                            "*ALL*. *UPPERCASE*. OR ELSE I *CAN'T* HEAR YOU",
                            "",
                        ]
                        await message.reply(replies[mathjs.randomInt(0, replies.length)]);
                    }
                    return;
                default:
                    sillyObj[id] = 0;
                    break;
            }
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
        
        if (count.lastCounter === id) {
            resetNumber(message, 'uhhh... you know you can\'t count twice in a row, right??');
            return;
        }

        if (num === count.current + 1) {
            message.react('✅');
            count.lastCounter = id;
            count.current++;
            console.log("count current : " + _s[message.guildId].count.current);
        } else {
            resetNumber(message, (count.prevNumber < 10) ?
                'you can do better than THAT...' :
                'you got pretty far. but i think you could definitely do better than ' + count.highestNum + '.'
            );
        }
    } else if (message.channel.id === _s[message.guildId].chain.channel) {
        await chainFunc(message, 3);
    } else if (_s[message.guildId].chain.autoChain >= 0) {
        //chainFunc(message, chain.autoChain);
    }
    if (_s[message.guildId].convo.convoChannel?.id === message.channel.id) {
        var replyChannel = _s[message.guildId].convo.replyChannel;
        replyChannel.send(makeReply(`${message.author.displayName}[:](${message.url})`));
    } else if (_s[message.guildId].convo.replyChannel?.id === message.channel.id) {
        console.log(message.content);
        _s[message.guildId].convo.convoChannel.send(message.content);
    }
    // #endregion
});

async function parseCommand(message: dc.Message<boolean>, content: string, command: string, comms: object) : Promise<Command>
{
    if (!comms.hasOwnProperty(command)) {
        console.error("nope. no " + command + " here");
        return null;
    }
    var timeBefore = currentTime();
    var com : Command = comms[command];

    // parse command if it's not limited to anybody, if it's limited to the person who sent the message, or if they're a fully trusted user
    if (com.limitedTo.length === 0 || com.limitedTo.includes(message.author.id) || trustedUsers.includes(message.author.id)) {
        var dateNow = Date.now(); // actually really good for global time so that i don't need to persist it
        if (com.currentTimeout > dateNow) { // handle command timeout if needed, will send a message to tell the commander there's a timeout then delete once the command is ready, or in 5 seconds
            var timeToWait = com.currentTimeout - dateNow;
            var timeToWaitReply = timeToWait < 1000 ? timeToWait + " milliseconds" : mathjs.round(timeToWait / 1000) + " seconds";
            var timeoutReply = await message.reply(makeReply("gotta wait " + timeToWaitReply + ". lol."));
            await sleep(mathjs.min(timeToWait, convertTime(5, 's', 'ms'))); // hurrah for convertTime()
            timeoutReply.delete();
            return com;
        }
        //// #region parameter stuff
        var paramObj = {}; // an object with the values of parameters assigned to the name of parameters
        const space = '↭'; // will always use the same character for replacing spaces (also look at that freak. why he so wobbly)
        if (content.indexOf(' ') > -1) { // if message contains space, assume it contains parameters
            var tempParameters: string[] = [];
            
            if (content.indexOf('"') > -1) {
                var sections = content.split('"');
                for (var i = 0; i < sections.length; i++) { 
                    // every other section will be in double quotes, so just use modulo. also check if it actually has spaces needed to be replaced
                    if (i % 2 === 1 && sections[i].indexOf(' ') > -1) {
                        sections[i] = sections[i].split(' ').join(space); // most reliable way to replace all spaces with the temporary space character
                    }
                }
                tempParameters = sections.join('').split(' '); // join everything back together then split it up as parameters
            } else {
                tempParameters = content.split(' ');
            }
            
            tempParameters.shift(); // remove the first element (the command) from the parameters

            var j = 0; // funny second iterator variable
            console.log(com.inf);
            for (var i = 0; i < (com.inf ? tempParameters.length : Math.min(tempParameters.length, com.params.length)); i++) {
                // i've searched so much but this is the best way i can find to convert to the preset's type
                function convParam(content: string, param: Param) : any {
                    switch (param.type) {
                        case "string" : return String(content); // just for safety :)
                        case "number" : return Number(content);
                        case "boolean": return content === "true";
                        default: console.error("type " + param.type + " not supported! did something go wrong or do you need to add another case?"); 
                            break;
                    }
                }
                // convert space character back to actual spaces, if it needs them
                if (tempParameters[i].indexOf(space) > -1) {
                    tempParameters[i] = tempParameters[i].split(space).join(' ');
                }
                // decides if the current param is being manually set or not, and assigns the paramObj accordingly
                if (tempParameters[i].indexOf(':') > -1) {
                    var halves = tempParameters[i].split(':');
                    var paramNum = Number(halves[0]);
                    var param = isNaN(paramNum) ? com.params.find(x => x.name === halves[0]) : com.params[paramNum];

                    if (Boolean(param)) {
                        paramObj[param.name] = convParam(halves[1], param) ?? param.preset;
                    }
                } else {
                    var param = com.params[j];
                    paramObj[param.name] = convParam(tempParameters[i], param)
                    j++;
                }
            }
        }
        //// #endregion

        // if parameter is not set, use the preset
        com.params.forEach((x: Param) => {
            if (!paramObj.hasOwnProperty(x.name)) {
                paramObj[x.name] = x.preset;
            }
        });

        try {
            var comTime = currentTime();
            com.currentTimeout = (Date.now() + com.timeout);
            console.log(`took ${comTime - timeBefore} milliseconds to complete parsing message`);
            await com.func(message, paramObj);
            console.log(`took ${currentTime() - comTime} milliseconds to finish function`);
        } catch (error) {
            console.error(error);
            await message.reply(makeReply(error, false));
        }
    } else {
        await message.reply(makeReply('hey, you can\'t use this command!'));
    }
    return com;
}

function listCommands(commandObj : object, listDescs : boolean = false, singleCom : string = "", showHidden : number = 0) : string
{
    if (singleCom && !commandObj.hasOwnProperty(singleCom)) {
        return `${singleCom} is NOT a command. try again :/`;
    }
    var response: string[] = [];
    var coms : string[] = singleCom ? [ singleCom ] : Object.keys(commandObj);
    for (let i = 0; i < coms.length; i++) {
        var com : Command = commandObj[coms[i]];
        var hidden = com.genre === "hidden";
        if (showHidden !== 1 && ((hidden && showHidden === 0) || (!hidden && showHidden === 2))) continue;
        var paramNames = Array.from(com.params, x => x.name);

        response.push(`$${coms[i]} (${paramNames.join(', ')}) : ${com.desc}\n`);
        
        if (listDescs) {
            var params = [];
            com.params.forEach(x => params.push(`-${x.name} (${String(x.type)}) : ${x.desc}\n`));
            response.push(params.join(''));
        }
    }
    
    return response.join('');
}

const genres = {};
// used to cache data like the help command, so that resources aren't wasted generating it again
// it isn't persistent, so data like the help command will get regenerated (good for if a new command is added/modified)
const commandData = {};
const commands = {
    "help" : new Command("bot/support", "lists all commands", async function (message: dc.Message<boolean>, p) {
        var reply = listCommands(commands, p["paramDescs"], p["whichCommand"]);
        await message.reply(makeReply(reply));
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ], []),

    "math" : new Command("general/fun", "does the math put in front of it", async function (message: dc.Message<boolean>, parameters) {
        try {
            message.reply(makeReply(String(mathjs.evaluate(parameters["equation"]))));
        } catch (error) {
            message.reply(makeReply(error));
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], []),

    "mathClass" : new Command("general/fun", "this is for school lol", async function (message: dc.Message<boolean>, parameters) {
        var nums = parameters["numbers"].split(' ');
        var feet = [];
        var inches = [];
        for (let i = 0; i < nums.length; i++) {
            var foot = i % 2 === 0;
            (foot ? feet : inches).push(Number (nums[i]));
        }
        var newStuff = [];
        for (let i = 0; i < feet.length; i++) {
            var modRad = (((feet[i] * 12) + inches[i]) / (Math.PI * 2));
            console.log(modRad);
            newStuff.push(String ((4/3) * Math.PI * (Math.pow(modRad, 3))));
        }

        message.reply(makeReply(newStuff.join("\n")));
        // uses params, not implemented yet. IMPORTANT ---------------------------------------------------------------------
        // var nums = parameters["params"].split(' ');
        // var feet = [];
        // var inches = [];
        // for (let i = 0; i < nums.length; i++) {
        //     var foot = i % 2 === 0;
        //     (foot ? feet : inches).push(Number (nums[i]));
        // }
        // var newStuff = [];
        // for (let i = 0; i < feet.length; i++) {
        //     var modRad = (((feet[i] * 12) + inches[i]) / (Math.PI * 2));
        //     console.log(modRad);
        //     newStuff.push(String ((4/3) * Math.PI * (Math.pow(modRad, 3))));
        // }

        // message.reply(makeReply(newStuff.join("\n")));
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], [], true),

    "echo" : new Command("general/fun", "echoes whatever's in front of it", async function (message: dc.Message<boolean>, parameters) {
        try {
            var time = convertTime(parameters["waitValue"], parameters["waitType"]);
            console.log(time);
            await sleep(time);
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

    "mock" : new Command("general/fun", "mocks text/whoever you reply to", async function (message: dc.Message<boolean>, parameters, del = true) {
        async function getMessage() {
            var messages = await message.channel.messages.fetch({ limit: 2 });
            var lastMessage = messages.last() ?? await getMessage();
            return lastMessage;
        }

        let reference = parameters["reply"] !== "" ? message : await (message.reference !== null ? message.fetchReference() : getMessage());
        let toMock    = parameters["reply"] !== "" ? parameters["reply"] : reference.content;

        const mock = [];
        for (let i = 0; i < toMock.length; i++) {
            let vary = i % 2 === 0;
            // if (parameters["variance"] !== 0) {
            //     let vary = i % 2 === 0;
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

    "true" : new Command("general/fun", "<:true:1149936632468885555>", async function (message: dc.Message<boolean>, parameters) {
        let reference: dc.Message<boolean>;
        try {
            reference = await message.fetchReference();
            await message.delete();
        } catch {
            await message.delete();
            let messages = await message.channel.messages.fetch({ limit: 1 });
            reference = messages.first();
        }

        const bigData = getBigData();
        
        for (let i = 0; i < Math.min(parameters["amount"], bigData.trueEmojis.length); i++) {
            try {
                await reference.react(bigData.trueEmojis[i]);
            } catch (error) {
                console.log("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you agree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ], [], false, 10000),

    "false" : new Command("hidden", "<:false:1123469352826576916>", async function (message: dc.Message<boolean>, parameters) {
        let reference: dc.Message<boolean>;
        try {
            reference = await message.fetchReference();
            await message.delete();
        } catch {
            await message.delete();
            let messages = await message.channel.messages.fetch({ limit: 1 });
            reference = messages.first();
        }
        
        const bigData = getBigData();
        for (let i = 0; i < Math.min(parameters["amount"], bigData.trueEmojis.length); i++) {
            try {
                await reference.react(bigData.trueEmojis[i]);
            } catch (error) {
                console.log("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you disagree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ], []),

    "jerma" : new Command("general/fun", "Okay, if I... if I chop you up in a meat grinder, and the only thing that comes out, that's left of you, is your eyeball, you'r- you're PROBABLY DEAD!", async function (message: dc.Message<boolean>, parameters) {
        switch (parameters["fileType"]) {
            case 0: {
                let reaction = message.react('✅');
                try {
                    if (!scpClient) scpClient = await scp.Client(remote_server);
                    if (!jermaFiles) jermaFiles = await scpClient.list('/home/opc/mediaHosting/jermaSFX/');

                    let result = `./temp/${parameters["fileName"]}.mp3`;
                    console.log(typeof jermaFiles);
                    let index = Math.round(Math.random() * jermaFiles.length - 1);
                    await scpClient.downloadFile(`/home/opc/mediaHosting/jermaSFX/${jermaFiles[index].name}`, result);
                    await message.channel.send({ files: [result] });
                    fs.unlink(result, ()=>{}); // lol it looks like a penis
                } catch (error) {
                    console.error(error);
                    await reaction;
                    await message.reactions.removeAll().catch(error => console.error('Failed to remove reactions:\n', error));
                    await message.react('❌');
                }
            } break;
            case 1: {
                if (!jermaClips) {
                    var tempClips = await google.youtube('v3').playlistItems.list({
                        auth: authenticate({ key: config.ytApiKey, type: "key" }),
                        part: [ 'id', 'snippet' ], playlistId: 'PLBasdKHLpmHFYEfFCc4iCBD764SmYqDDj', maxResults: 1000,
                    });
                    console.log("tempClips type : " + typeof tempClips)
                    jermaClips = tempClips.data.items;
                    console.log("jermaClips type : " + typeof jermaClips)
                }
                let index = Math.round(Math.random() * jermaClips.length - 1);
                await message.reply(makeReply(`[${jermaClips[index].snippet.title}](https://www.youtube.com/watch?v=${jermaClips[index].snippet.resourceId.videoId})`));
            } break;
            default:
                await message.reply(makeReply(`type "${parameters["fileType"]}" not supported!`));
                break;
        }
    }, [
        new Param("fileType", "the type of jerma file", 0),
        new Param("fileName", "the name of the resulting file", "jerma so silly"),
    ], []),

    "convertTime" : new Command("hidden", "converts time", async function(message: dc.Message<boolean>, parameters) {
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

    "countChannel" : new Command("patterns/counting", "sets the current channel to be the channel used for counting", async function (message: dc.Message<boolean>, parameters) {
        let channel = message.channel as dc.TextChannel;
        if (parameters["channel"]) {
            try {
                channel = await client.channels.fetch(parameters["channel"]) as dc.TextChannel;
            } catch (error) {
                try {
                    channel = message.guild.channels.cache.find(channel => channel.name.toLowerCase() === parameters["channel"].toLowerCase()) as dc.TextChannel;
                } catch (error) {
                    await message.react('❌');
                    return;
                }
            }
        }
        message.react('✅');
        
        let countChannel = _s[message.guildId].count.channel;
        let test = countChannel !== null && channel.id === countChannel.id;
        await channel.send(test ? `counting in ${channel.name.toLowerCase()} has ceased.` : `alright, count in ${channel.name.toLowerCase()}!`);
        _s[message.guildId].count.channel = test ? null : channel;
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], ["438296397452935169"]),

    "chainChannel" : new Command("patterns/chaining", "sets the current channel to be the channel used for message chains", async function (message: dc.Message<boolean>, parameters) {
        let channel = message.channel as dc.TextChannel;
        if (parameters["channel"]) {
            try {
                channel = await client.channels.fetch(parameters["channel"]) as dc.TextChannel;
            } catch (error) {
                try {
                    channel = message.guild.channels.cache.find(channel => channel.name.toLowerCase() === parameters["channel"].toLowerCase()) as dc.TextChannel;
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
            .then(x => (x as dc.TextChannel).send(isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.'))
            .catch(err => message.reply(makeReply(err)));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [ "438296397452935169" ]),

    "autoChain" : new Command("patterns/chaining", "will let any channel start a chain", async function (message: dc.Message<boolean>, parameters) {
        _s[message.guildId].chain.autoChain = parameters["howMany"];
        console.log(_s[message.guildId].chain.autoChain);
        message.reply(makeReply(`autoChain is now ${_s[message.guildId].chain.autoChain}.`));
    }, [
        new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)
    ], [ "438296397452935169" ]),

    "cmd" : new Command("hidden", "astrl only!! internal commands that would be dangerous to let everybody use", async function (message: dc.Message<boolean>, parameters) {
        var cont = message.content.substring(message.content.indexOf(' ') + 1)
        await parseCommand(message, cont, cont.split(' ')[0], cmdCommands);
    }, [], [ "438296397452935169" ]),
}

// for more internal purposes; really just for astrl lol
const cmdCommands = {
    "help" : new Command("bot/support", "lists all cmd commands", async function (message: dc.Message<boolean>, p) {
        var reply = listCommands(cmdCommands, p["paramDescs"], p["whichCommand"]);
        await message.reply(makeReply(reply));
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
        // new Param("debug", "gets the specific component of a command", ""),
    ]),

    "save" : new Command("bot", "saves the bot's data", async (m, p) => await save()),
    "load" : new Command("bot", "loads the bot's data", async (m, p) => await load()),

    "eval" : new Command("general/fun", "runs javascript code from a string", async function (message: dc.Message<boolean>, parameters) {
        try {
            let code = await eval(parameters["code"])
            if (parameters["return"] && code) {
                message.reply(makeReply(code));
            } else {
                message.react('✅');
            }
        } catch (error) {
            message.reply(makeReply(error));
        }
    }, [
        new Param("code", "the code to run", "message.reply('lol???')"),
        new Param("return", "should the bot reply with what the code returned?", true),
    ]),

    "sanityCheck" : new Command("bot", "checks the parameters of each command to see if any overlap", async function(message: dc.Message<boolean>, parameters) {
        var overlaps = [];
        for (var com in commands) {
            console.log(commands[com]);
            var params : Param[] = commands[com].params;
            params.forEach(x => {
                params.forEach(y => {
                    if (x.name === y.name && x !== y) {
                        overlaps.push(`${x.name} (preset : ${x.preset}) : ${x.desc}`);
                    }
                });
            });
        }
        var reply = overlaps.length > 0 ?
            "overlaps:\n" + overlaps.join('\n') +"\nastrl u dumbass" : 
            "no overlaps here! wow isn't astrl such a good programmer" + emojis.smide;
        await message.reply(makeReply(reply));
    }, [
        // new Param("doubleUp", "desription on", 52),
        // new Param("doubleUp", "descirtpn dos", "this is a default"),
    ]),

    "resetCount" : new Command("patterns/counting", "resets the current count", async function (message: dc.Message<boolean>, parameters) {
        resetNumber(message, 'reset the count!', '✅');
    }, [], ["438296397452935169"]),

    "send" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message: dc.Message<boolean>, parameters) {
        try {
            var guild = client.guilds.cache.get(parameters["guild"]);
            if (guild !== undefined) {
                var channel = guild.channels.cache.get(parameters["channel"]) as dc.TextChannel;
                await channel?.send(makeReply(parameters["message"]));
            }
        } catch (error) {
            await message.reply(makeReply("dumbass\n"+error))
        }
    }, [
        new Param("message", "the message to send into the channel", "hey guys spam ping astrl in half an hour. it would be really really funny " + emojis.smide),
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ], [
        "438296397452935169",
    ]),

    "convo" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message: dc.Message<boolean>, parameters) {
        try {
            var guild : dc.Guild = client.guilds.cache.get(parameters["guild"]);
            if (guild !== undefined) {
                var channel = guild.channels.cache.get(parameters["channel"]);
                _s[message.guildId].convo.convoChannel = channel
                _s[message.guildId].convo.replyChannel = message.channel
            }
        } catch (error) {
            await message.reply(makeReply("dumbass\n"+error))
        }
    }, [
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ], [
        "438296397452935169",
    ]),

    "kill" : new Command("bot", "kills the bot", async function (message: dc.Message<boolean>, parameters) {
        await message.channel.send('bot is now dead 😢');
        await kill();
    }, [],
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),

    "didAnythingBreak?" : new Command("bot", "just testing every command until something breaks", async function (message: dc.Message<boolean>, parameters) {
        var keys = Object.keys(commands);
        for (let i = 0; i < keys.length; i++) {
            await message.reply(makeReply("testing command " + keys[i]))
            await sleep(1000);
            await parseCommand(message, (config.prefix + keys[i]), keys[i], commands);
            await sleep(1000);
        }

        message.reply(makeReply("finished!"));
    }, [], []),

    "test" : new Command("bot", "various things astrl will put in here to test node.js", async function (message: dc.Message<boolean>, p) {
        // var reply = listCommands(commands, false, "", p["lol"]);
        // message.reply(makeReply(reply));
    }, [
        new Param("lol", "just for math class", 0)
    ],
    [
        "438296397452935169",
        "705120334705197076",
        "686222324860715014",
    ]),
}
// Log in to Discord with your client's token
client.login(config.token);