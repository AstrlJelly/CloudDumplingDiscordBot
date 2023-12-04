// Require the necessary discord.js classes
// import process from 'node:process';
import fs from 'fs';
import os from 'os';
import scp from 'node-scp';
import dc from 'discord.js';
// import brain from 'brain.js';
import * as mathjs from 'mathjs';
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
enum PersistPaths
{
    server = "./persistence/servers.json",
    user = "./persistence/users.json",
}

let debugMode = false;
let bigDataTemp = null;

// exists because i don't want so much data in memory, but i need to use big-data multiple times in a row
function getBigData() {
    if (fs.existsSync("./big-data.json")) {
        if (!bigDataTemp) {
            bigDataTemp = JSON.parse(fs.readFileSync("./big-data.json", 'utf-8'))
            wipeBigData();
        }
        return bigDataTemp;
    } else {
        console.error("Big-data doesn't exist...")
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

function sendTo(target : dc.Message | dc.TextBasedChannel, content : string, ping : boolean = false, files : string[] = []) : Promise<dc.Message> {
    try {
        let isChannel = typeof target == typeof dc.TextChannel;
        var content = content.toString();
        var length = content.length;
        if (length === 0 && files?.length === 0) {
            content = "can't send an empty message!";
        } else if (length > 2000) {
            content = content.slice(0, 2000 - (length.toString().length + 12)) + ` + ${length} more...`
        }
        var replyObj = { content: content, allowedMentions: { repliedUser: (!isChannel && ping) } };
        if (files.length[0]) replyObj["files"] = files;
        
        if (isChannel) {
            return (target as dc.TextChannel).send(replyObj);
        } else {
            return (target as dc.Message).reply(replyObj);
        }
    } catch (error) {
        console.error("replyTo() broke!! error : " + error);
        return null;
    }
}

async function sleep(ms : number, push : boolean = true) : Promise<void> {
    var t = new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
        if (push) allTimeouts.push({ 
            timeout : t,
            startTime : Date.now(),
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
    fs.writeFileSync(PersistPaths.server, JSON.stringify({ ..._s }, null, '\t'), null);
    fs.writeFileSync(PersistPaths.user,   JSON.stringify({ ..._u }, null, '\t'), null);
    var date = new Date();
    var times = [ date.getHours(), date.getMinutes(), date.getSeconds() ];
    var timeText = [];
    for (var i = 0; i < times.length; i++) {
        timeText.push(times[i].toString());
        if (timeText[i].length < 2) timeText[i] = "0" + timeText[i];
    }
    console.info(`The file was saved! (${timeText.join(':')})`);
}

async function load() {
    if (!PERSIST) return;
    console.info("Start loading from JSON...");
    let serverObj = {};
    var before = performance.now();
    var data = null;
    if (fs.existsSync(PersistPaths.server)) {
        data = fs.readFileSync(PersistPaths.server, 'utf-8');
    }
    if (data != null) {
        serverObj = JSON.parse(data);
        console.info("The file was loaded!");

        function defaultCheck(obj : object, objAdd : object, root : string) {
            Object.keys(obj).forEach(key => {
                var value = obj[key];
                var newKey = (root === "") ? (key) : (root + "/" + key)
                if (typeof value === 'object' && value !== null) { // if it's an object, set up the root and iterate through it
                    defaultCheck(value, objAdd, newKey)
                } else {                                           // otherwise just add it to the object to check it
                    objAdd[newKey] = value;
                }
            });
        }

        var dataCheck = {};
        var serverCheck = {};
        defaultCheck(serverObj["default"], dataCheck, "")
        defaultCheck(_s["default"], serverCheck, "")

        var check1 = Object.keys(dataCheck);
        var check2 = Object.keys(serverCheck);

        var newDefaults : string[] = []
        for (let i = 0; i < check2.length; i++) {
            if (check1.every((key2) => key2 != check2[i])) { // if there's something new in the default
                console.log(check2[i] + " is missing!")
                newDefaults.push(check2[i]);
            }
        }
    }

    client.guilds.cache.forEach(guild => {
        if (!serverObj.hasOwnProperty(guild.id)) { // if there's no server object
            console.log("Guild with id \"" + guild.id + "\" set to default");
            _s[guild.id] = JSON.parse(JSON.stringify(_s["default"])); // this might be a terrible idea but it Just Works
        } else {                                 // if there is a server object
            console.log("LOADED guild with id \"" + guild.id + "\"");
            _s[guild.id] = serverObj[guild.id];

            // uses the newDefaults array to grab keys
            for (let i = 0; i < newDefaults.length; i++) {
                var keys = newDefaults[i].split('/')
                switch (keys.length) { // dude there's gotta be a better way to do this
                    case 1: _s[guild.id][keys[0]] = _s["default"][keys[0]];
                        break;
                    case 2: _s[guild.id][keys[0]][keys[1]] = _s["default"][keys[0]][keys[1]];
                        break;
                    case 3: _s[guild.id][keys[0]][keys[1]][keys[2]] = _s["default"][keys[0]][keys[1]][keys[2]];
                        break;
                    default: console.error(`${newDefaults[i]} is too deep/broken! help me!!!`)
                        break;
                }
            }
        }
    })
    console.log("Took " + ((performance.now() - before) / 1000) + " milliseconds to finish loading from JSON");
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

// converts from seconds to minutes, hours to ms, minutes to days, etc.
function convertTime(time = 0, typeFrom = 's', typeTo = 'ms') {
    if (typeTo === typeFrom) return time;

    let modifier = 1;
    const times =    [ 'ms', 's', 'm', 'h', 'd', 'w' ];
    const converts = [ 1000, 60,  60,  24,   7       ];
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
    limitedTo: string[][]
    timeout: number
    currentTimeout: number
    constructor(genre: string, desc: string, func : { (message: dc.Message<boolean>, p: any): Promise<void> }, params: Param[] = [], limitedTo = [], timeout = 0) {
        for (let i = 0; i < 3; i++) {
            if (!limitedTo[i]) limitedTo[i] = [];
        }
        this.genre = genre;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
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

// let sillyObj = {
//     "391459218034786304" : 0, // untitled
//     "999020930800033876" : 0, // raffy
// }

let _s = {
    "default" : {
        commands : {}, // really just for timeouts for now

        count : {
            channel : null,
            current: 0,      // the last number said that was correct
            prevNumber: 0,   // used to reset back to the last number if i messed up my code
            highestNum: 0,   // the highest number ever gotten to
            lastCounter: "", // used to check for duplicates
        },
        
        chain : {
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
        },

        // test11 : "this isn't deep.",
        // test12 : {
        //     test21 : "this is kinda deep.",
        //     test22 : {
        //         test31 : "this is so deep!",
        //         test32 : "Wow.",
        //     },
        // },
    },
};
let _u = {
    "default" : {
        silly: -1
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
    await sendTo(message, reply);
}

async function chainFunc(message: dc.Message<boolean>, inRow: string | number) {
    console.log("First " + inRow);
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

    var userData = _u[id];

    // #region command handler
    if (message.content.startsWith(config.prefix) && commands.hasOwnProperty(commandFromMessage)) {
        // 5% chance to happen, if this person is in sillyObj
        if (((userData.silly === 0 && mathjs.random()) || userData.silly > 0)) {
            switch (userData.silly) {
                case 0:
                    await sendTo(message, "huh? speak up next time buddy.");
                    userData.silly++;
                    return;
                case 1:
                    if (message.content === message.content.toUpperCase()) {
                        userData.silly = 0;
                    } else {
                        var replies : string[] = [
                            "SPEAK UP!!! CAN'T HEAR YOU!!!!",
                            "dude what did i JUST tell you. ugh.",
                            "*ALL*. *UPPERCASE*. OR ELSE I *CAN'T* HEAR YOU",
                            "",
                        ]
                        await sendTo(message, replies[mathjs.randomInt(0, replies.length)]);
                    }
                    return;
                default:
                    userData.silly = 0;
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
            console.log("Count current : " + _s[message.guildId].count.current);
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
        sendTo(replyChannel, `${message.author.displayName}[:](${message.url})`);
    } else if (_s[message.guildId].convo.replyChannel?.id === message.channel.id) {
        sendTo(_s[message.guildId].convo.convoChannel, message.content);
    }
    // #endregion
});

async function parseCommand(message: dc.Message<boolean>, content: string, command: string, comms: object) : Promise<Command>
{
    if (!comms.hasOwnProperty(command)) {
        console.error("Nope. No " + command + " here.");
        return null;
    }
    var timeBefore = currentTime();
    var com : Command = comms[command];

    // parse command if it's not limited to anybody, if it's limited to the person who sent the message, or if they're a fully trusted user
    if (com.limitedTo[0].length === 0 || com.limitedTo[0].includes(message.author.id) || trustedUsers.includes(message.author.id)) {
        var dateNow = Date.now(); // actually really good for global time so that i don't need to persist it
        if (com.currentTimeout > dateNow) { // handle command timeout if needed, will send a message to tell the commander there's a timeout then delete once the command is ready, or in 5 seconds
            var timeToWait = com.currentTimeout - dateNow;
            var timeToWaitReply = timeToWait < 1000 ? timeToWait + " milliseconds" : mathjs.round(timeToWait / 1000) + " seconds";
            var timeoutReply = await sendTo(message, "gotta wait " + timeToWaitReply + ". lol.");
            await sleep(mathjs.min(timeToWait, convertTime(5, 's', 'ms'))); // hurrah for convertTime()
            timeoutReply.delete();
            return com;
        }
        // #region parameter stuff
        var paramObj = { params : [] }; // an object with the values of parameters assigned to the name of parameters
        const space = '↭'; // will always use the same character for replacing spaces (also look at that freak. why he so wobbly)
        if (content.indexOf(' ') > -1) { // if message contains space, assume it contains parameters
            var tempParameters: string[] = [];
            
            if (content.indexOf('"') > -1) {
                var quoteSplit = content.split('"');
                for (var i = 0; i < quoteSplit.length; i++) { 
                    // every other section will be in double quotes, so just use modulo. 
                    // also check if it actually has spaces needed to be replaced
                    if (i % 2 === 1 && quoteSplit[i].indexOf(' ') > -1) {
                        quoteSplit[i] = quoteSplit[i].split(' ').join(space); // most reliable way to replace all spaces with the temporary space character
                    }
                }
                tempParameters = quoteSplit.join('').split(' '); // join everything back together then split it up as parameters
            } else {
                tempParameters = content.split(' ');
            }
            
            tempParameters.shift(); // remove the first element (the command) from the parameters

            function convParam(content: string, type: any) : any {
                switch (type) {
                    case "string" : return String(content); // just for safety :)
                    case "number" : return Number(content);
                    case "boolean": return content === "true";
                    default: console.error("Type " + param.type + " not supported! Did something go wrong or do you need to add another case?"); 
                        break;
                }
            }

            console.log(tempParameters[0]);

            var inf = (com.params?.[com.params.length - 1].name  === "params"); // inf params parameter should always be the last one
            var i = 0; // less strict scope cuz i need to use it in the second loop
            var j = 0; // funny second iterator variable
            while (i < mathjs.min(com.params.length, tempParameters.length)) {
                // i've searched so much but this is the best way i can find to convert to the preset's type
                // convert space character back to actual spaces, if it needs them
                if (tempParameters[i].indexOf(space) > -1) {
                    tempParameters[i] = tempParameters[i].split(space).join(' ');
                }
                // decides if the current param is being manually set or not, and assigns the paramObj accordingly
                if (tempParameters[i].indexOf(':') > -1) {
                    var halves = tempParameters[i].split(':');

                    if (halves[0] === "params") { // start setting inf params if content is "params:"
                        if (!inf) {
                            sendTo(message, "that command doesn't support params, bee tee dubs", true);
                        } else {
                            // if there's not a space between the colon and the start of the inf params, replace the parameter with the inf param value
                            if (halves.length > 1) { 
                                tempParameters[i] = halves[1];
                            } else {
                                i += 2;
                            }
                            break;
                        }
                    }
                    
                    // check if the first section is a number, and if it is, just grab the parameter with that index
                    var paramNum = Number(halves[0]);
                    var param = isNaN(paramNum) ? com.params.find(x => x.name === halves[0]) : com.params[paramNum];
                    
                    if (param !== undefined) {
                        paramObj[param.name] = convParam(halves[1], param.type) ?? param.preset;
                    }
                } else {
                    var param = com.params[j];
                    paramObj[param.name] = convParam(tempParameters[i], param.type)
                    j++;
                }
                i++;
            }

            if (inf && (i < tempParameters.length)) {
                while (i < tempParameters.length) {
                    paramObj.params.push(convParam(tempParameters[i], typeof (com.params["params"])));
                    console.log(`param ${tempParameters[i]}`);
                    i++;
                }
            }
        }
        // #endregion

        // if parameter is not set, use the preset
        com.params.forEach((x: Param) => {
            if (!paramObj.hasOwnProperty(x.name)) {
                paramObj[x.name] = x.preset;
            }
        });

        try {
            var comTime = currentTime();
            com.currentTimeout = (Date.now() + com.timeout);
            if (debugMode) console.log(`Took ${comTime - timeBefore} milliseconds to complete parsing message`);
            await com.func(message, paramObj);
            if (debugMode) console.log(`Took ${currentTime() - comTime} milliseconds to finish function`);
        } catch (error) {
            console.error(error);
            await sendTo(message, error, false);
        }
    } else {
        await sendTo(message, 'hey, you can\'t use this command!');
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
        await sendTo(message, reply);
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ], []),

    "math" : new Command("general/fun", "does the math put in front of it", async function (message: dc.Message<boolean>, p) {
        try {
            sendTo(message, mathjs.evaluate(p["equation"]));
        } catch (error) {
            sendTo(message, error);
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ], []),

    "mathClass" : new Command("general/fun", "this is for school lol", async function (message: dc.Message<boolean>, p) {
        var feet = [];
        var inches = [];
        for (let i = 0; i < p["params"].length; i++) {
            (i % 2 === 0 ? feet : inches).push(Number(p["params"][i]));
        }
        var newStuff = [];
        for (let i = 0; i < feet.length; i++) {
            var modRad = (((feet[i] * 12) + inches[i]) / (Math.PI * 2));
            console.log(modRad);
        }

        sendTo(message, newStuff.join("\n"));
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
        new Param("params", "the numbers to use in the math", "undefined"),
    ], []),

    "echo" : new Command("general/fun", "echoes whatever's in front of it", async function (message: dc.Message<boolean>, p) {
        try {
            var time = convertTime(p["waitValue"], p["waitType"]);
            await sleep(time);
            sendTo(message.channel, p["reply"]);
            if (p["delete"]) message.delete();
        } catch (error) {
            sendTo(message.channel, error);
        }
    }, [
        new Param("reply", "the message to echo back to you", "..."),
        new Param("waitValue", "the time it will take to echo back your message", 0),
        new Param("waitType", "i.e ms (milliseconds), s (seconds), m (minutes)", 's'),
        new Param("delete", "deletes message after sending", false),
    ], []),

    "mock" : new Command("general/fun", "mocks text/whoever you reply to", async function (message: dc.Message<boolean>, p) {
        async function getMessage() {
            var messages = await message.channel.messages.fetch({ limit: 2 });
            var lastMessage = messages.last() ?? await getMessage();
            return lastMessage;
        }

        let reference = p["reply"] !== "" ? message : await (message.reference !== null ? message.fetchReference() : getMessage());
        let toMock    = p["reply"] !== "" ? p["reply"] : reference.content;

        const mock = [];
        for (let i = 0; i < toMock.length; i++) {
            let vary = i % 2 === 0;
            // if (p["variance"] !== 0) {
            //     let vary = i % 2 === 0;
            // }

            // let vary;
            // if (mock[i - 1] === mock[i - 1].toLowerCase()) {
            //     vary = ;
            // }
            mock.push(vary ? toMock[i].toLowerCase() : toMock[i].toUpperCase());
        }
        if (p["reply"] === "") {
            sendTo(reference, mock.join(''));
        } else {
            sendTo(reference.channel, mock.join(''));
        }

        await message.delete();
    }, [
        new Param("reply", "the message to mock", ""),
        new Param("variance", "the amount of variance in the mocking (INITIALIZATION ONLY)", 0),
        new Param("message", "the message id to mock", ""),
    ], []),

    "true" : new Command("general/fun", emojis.true, async function (message: dc.Message<boolean>, p) {
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
        
        for (let i = 0; i < Math.min(p["amount"], bigData.trueEmojis.length); i++) {
            try {
                await reference.react(bigData.trueEmojis[i]);
            } catch (error) {
                console.log("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you agree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ], [], 10000),

    "false" : new Command("hidden", "<:false:1123469352826576916>", async function (message: dc.Message<boolean>, p) {
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
        for (let i = 0; i < Math.min(p["amount"], bigData.trueEmojis.length); i++) {
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

    "jerma" : new Command("general/fun", "Okay, if I... if I chop you up in a meat grinder, and the only thing that comes out, that's left of you, is your eyeball, you'r- you're PROBABLY DEAD!", async function (message: dc.Message<boolean>, p) {
        switch (p["fileType"]) {
            case 0: {
                let reaction = message.react('✅');
                try {
                    if (!scpClient) scpClient = await scp.Client(remote_server);
                    if (!jermaFiles) jermaFiles = await scpClient.list('/home/opc/mediaHosting/jermaSFX/');

                    let result = `./temp/${p["fileName"]}.mp3`;
                    let index = Math.round(Math.random() * jermaFiles.length - 1);
                    await scpClient.downloadFile(`/home/opc/mediaHosting/jermaSFX/${jermaFiles[index].name}`, result);
                    await sendTo(message.channel, "", true, [result]);
                    fs.unlinkSync(result);
                } catch (error) {
                    console.error(error);
                    await reaction;
                    await message.reactions.removeAll().catch(error => console.error('Failed to remove reactions:\n', error));
                    await message.react('❌');
                }
            } break;
            case 1: {
                if (!jermaClips) { // this changed randomly at one point, idk why. makes things look better though
                    var tempClips = await google.youtube('v3').playlistItems.list({
                        auth: config.ytApiKey,
                        part: [ 'id', 'snippet' ], playlistId: 'PLBasdKHLpmHFYEfFCc4iCBD764SmYqDDj', maxResults: 1000,
                    });
                    jermaClips = tempClips.data.items
                }
                let index = Math.round(Math.random() * jermaClips.length - 1);
                await sendTo(message, (`[${jermaClips[index].snippet.title}](https://www.youtube.com/watch?v=${jermaClips[index].snippet.resourceId.videoId})`));
            } break;
            default:
                await sendTo(message, (`type "${p["fileType"]}" not supported!`));
                break;
        }
    }, [
        new Param("fileType", "the type of jerma file", 0),
        new Param("fileName", "the name of the resulting file", "jerma so silly"),
    ], []),

    "convertTime" : new Command("hidden", "converts time", async function(message: dc.Message<boolean>, p) {
        var newTime = convertTime(p["time"], p["typeFrom"], p["typeTo"]);
        sendTo(message, (`${p["time"]} ${p["typeFrom"]} is ${newTime} ${p["typeTo"]}`));
    }, [
        new Param("time", "", 0),
        new Param("typeFrom", "the time to convert from", "s"),
        new Param("typeTo",   "the time to convert to",   "s"),
    ]),

    "countChannel" : new Command("patterns/counting", "sets the current channel to be the channel used for counting", async function (message: dc.Message<boolean>, p) {
        let channel = message.channel as dc.TextChannel;
        if (p["channel"]) {
            try {
                channel = await client.channels.fetch(p["channel"]) as dc.TextChannel;
            } catch (error) {
                try {
                    channel = message.guild.channels.cache.find(channel => channel.name.toLowerCase() === p["channel"].toLowerCase()) as dc.TextChannel;
                } catch (error) {
                    await message.react('❌');
                    return;
                }
            }
        }
        message.react('✅');
        
        let countChannel = _s[message.guildId].count.channel;
        let test = countChannel !== null && channel.id === countChannel.id;
        await sendTo(channel, test ? `counting in ${channel.name.toLowerCase()} has ceased.` : `alright, count in ${channel.name.toLowerCase()}!`);
        _s[message.guildId].count.channel = test ? null : channel;
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [[ "438296397452935169" ]]),

    "chainChannel" : new Command("patterns/chaining", "sets the current channel to be the channel used for message chains", async function (message: dc.Message<boolean>, p) {
        let channel = message.channel as dc.TextChannel;
        if (p["channel"]) {
            try {
                channel = await client.channels.fetch(p["channel"]) as dc.TextChannel;
            } catch (error) {
                try {
                    channel = message.guild.channels.cache.find(channel => channel.name.toLowerCase() === p["channel"].toLowerCase()) as dc.TextChannel;
                } catch (error) {
                    await message.react('❌');
                    return;
                }
            }
        }
        message.react('✅');

        if (channel.id === getServer(channel.guildId).count.channel.id) {
            sendTo(channel, `counting in ${channel.name.toLowerCase()} has ceased.`);
            getServer(channel.guildId).count.channel = null;
        } else {
            sendTo(channel, `alright, count in ${channel.name.toLowerCase()}!`);
            getServer(channel.guildId).count.channel = channel;
        }

        // old stuff here
        let channelId = p["channel"] ? p["channel"] : message.channel.id;
        let isChannel = _s[message.guildId].chain.channel === channelId;

        _s[message.guildId].chain.channel = isChannel ? "" : channelId;
        channel = client.channels.cache.get(channelId) as dc.TextChannel;
        await sendTo(channel, isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.')
                .catch(err => sendTo(message, err));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [ "438296397452935169" ]),

    "autoChain" : new Command("patterns/chaining", "will let any channel start a chain", async function (message: dc.Message<boolean>, p) {
        _s[message.guildId].chain.autoChain = p["howMany"];
        console.log(_s[message.guildId].chain.autoChain);
        sendTo(message, (`autoChain is now ${_s[message.guildId].chain.autoChain}.`));
    }, [
        new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)
    ], [ "438296397452935169" ]),

    "cmd" : new Command("hidden", "astrl only!! internal commands that would be dangerous to let everybody use", async function (message: dc.Message<boolean>, p) {
        var cont = message.content.substring(message.content.indexOf(' ') + 1)
        await parseCommand(message, cont, cont.split(' ')[0], cmdCommands);
    }, [], [ "438296397452935169" ]),
}

// for more internal purposes; really just for astrl lol
const cmdCommands = {
    "help" : new Command("bot/support", "lists all cmd commands", async function (message: dc.Message<boolean>, p) {
        var reply = listCommands(cmdCommands, p["paramDescs"], p["whichCommand"]);
        await sendTo(message, (reply));
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ]),

    "save" : new Command("bot", "saves the bot's data", async (m, p) => await save()),
    "load" : new Command("bot", "loads the bot's data", async (m, p) => await load()),

    "eval" : new Command("general/fun", "runs javascript code from a string", async function (message: dc.Message<boolean>, p) {
        let cont = message.content;
        let reaction : Promise<dc.MessageReaction>;
        try {
            reaction = message.react('✅');
            var code = cont.substring(cont.indexOf(' ', cont.indexOf(' ') + 1) + 1);
            console.log(await new Function('message', code)(message));
        } catch (error) {
            await reaction.then(async reaction => {
                await reaction.remove();
                await message.react('❌');
                await sendTo(message, (error));
            })
        }
    }, []),

    "evalReturn" : new Command("general/fun", "runs javascript code from a string", async function (message: dc.Message<boolean>, p) {
        let cont = message.content;
        let reaction : Promise<dc.MessageReaction>;
        try {
            reaction = message.react('✅');
            var code = cont.substring(cont.indexOf(' ', cont.indexOf(' ') + 1) + 1);
            var codeReturn = await new Function('message', code)(message);
            await sendTo(message, codeReturn)
        } catch (error) {
            await reaction.then(async reaction => {
                await reaction.remove();
                await message.react('❌');
                await sendTo(message, (error));
            })
        }
    }, []),

    "sanityCheck" : new Command("bot", "do several checks on all the commands to make sure they're up to snuff", async function(message: dc.Message<boolean>, p) {
        var overlaps = [];
        var reply : string[] = []
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
            if (params.find(x => x.name === "params") && params[params.length - 1].name !== "params") {
                reply.push(com + " has its inf params parameter in the wrong place!");
            }
        }
        reply.push(overlaps.length > 0 ?
            "overlaps:\n" + overlaps.join('\n') +"\nastrl u dumbass" : 
            "no overlaps here! wow isn't astrl such a good programmer" + emojis.smide);
        await sendTo(message, (reply.join('\n')));
    }, [
        // new Param("doubleUp", "desription on", 52),
        // new Param("doubleUp", "descirtpn dos", "this is a default"),
    ]),

    "resetCount" : new Command("patterns/counting", "resets the current count", async function (message: dc.Message<boolean>, p) {
        resetNumber(message, 'reset the count!', '✅');
    }, []),

    "send" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message: dc.Message<boolean>, p) {
        try {
            var guild = client.guilds.cache.get(p["guild"]);
            if (guild !== undefined) {
                var channel = guild.channels.cache.get(p["channel"]) as dc.TextChannel;
                await sendTo(channel, p["message"]);
            }
        } catch (error) {
            await sendTo(message, "dumbass\n"+error)
        }
    }, [
        new Param("message", "the message to send into the channel", "hey guys spam ping astrl in half an hour. it would be really really funny " + emojis.smide),
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ]),

    "convo" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (message: dc.Message<boolean>, p) {
        try {
            var guild : dc.Guild = client.guilds.cache.get(p["guild"]);
            if (guild !== undefined) {
                var channel = guild.channels.cache.get(p["channel"]);
                _s[message.guildId].convo.convoChannel = channel
                _s[message.guildId].convo.replyChannel = message.channel
            }
        } catch (error) {
            await sendTo(message, "dumbass\n"+error)
        }
    }, [
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ]),

    "optimizing" : new Command("bot", "turns on/off optimizing mode (sends more messages into the console)", async function (message: dc.Message<boolean>, p) {
        debugMode = p["turnOn"] ?? !debugMode;
        await message.react('✅');
    }, [ new Param("turnOn", "force turn on or off. lol", null, String) ]),

    "restart" : new Command("bot", "restarts the bot", async function (message: dc.Message<boolean>, p) {
        await sendTo(message.channel, 'bot is restarting');
        await save();
        await client.destroy();
    }, []),

    "kill" : new Command("bot", "kills the bot", async function (message: dc.Message<boolean>, p) {
        await sendTo(message.channel, 'bot is now dead 😢');
        await kill();
    }, []),

    "didAnythingBreak?" : new Command("bot", "just testing every command until something breaks", async function (message: dc.Message<boolean>, p) {
        // this is silly and doesn't really work lol
        var keys = Object.keys(commands);
        for (let i = 0; i < keys.length; i++) {
            await sendTo(message, ("testing command " + keys[i]))
            await sleep(1000);
            await parseCommand(message, (config.prefix + keys[i]), keys[i], commands);
            await sleep(1000);
        }

        sendTo(message, "finished!");
    }, [], []),

    "test" : new Command("bot", "various things astrl will put in here to test node.js/discord.js", async function (message: dc.Message<boolean>, p) {
        console.log("params : " + (p["params"]));
    }, [
        new Param("lol", "use this for anything", ""),
        new Param("params", "how new and innovative!", 0)
    ], [[]]),
}
// Log in to Discord with your client's token
client.login(config.token);