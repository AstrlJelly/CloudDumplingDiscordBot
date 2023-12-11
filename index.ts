// import process from 'node:process';
import fs from 'fs';
import os from 'os';
import scp from 'node-scp';
import dc from 'discord.js';
import _ from 'underscore';
// import brain from 'brain.js';
// import neat from 'neataptic';
import * as mathjs from 'mathjs';
import { wordsToNumbers } from 'words-to-numbers';
import { google } from 'googleapis';

let debugMode = true;

const shouldExist = [ "private/config.json", "emojis.json", "private/ssh.key" ];
for (let i = 0; i < shouldExist.length; i++) {
    const path = "./" + shouldExist[i];
    if (!fs.existsSync(path)) {
        throw new Error("wts!?!? " + path + " doesn't exist");
    }
}

const config = JSON.parse(fs.readFileSync('./private/config.json', 'utf-8'));
const emojis = JSON.parse(fs.readFileSync('./emojis.json', 'utf-8'));

const client = new dc.Client({ // create a new discord client instance
    intents: Array.from(getBigData().intents, (x : string) => dc.GatewayIntentBits[x])
});

const trustedUsers : string[] = [ // only add to this if you FULLY TRUST THEM
    "438296397452935169", // astrl (me)
    "820357014831628309", // @12u3ie
];

const PERSIST = true;
enum PersistPaths
{
    server = "./persistence/servers.json",
    user = "./persistence/users.json",
    persist = "./persistence/persist.json",
}

enum Time
{
    millisecond = 0,
    second,
    minute,
    hour,
    day,
    week,
}

function findTime(time : string) : number {
    let times = [ 'ms', 's', 'm', 'h', 'd', 'w' ];
    let newTime = times.indexOf(time);
    return (newTime);
}

// scp client, currently just for grabbing
const remote_server = {
    host: '150.230.169.222',
    port: 22,
    username: 'opc',
    privateKey: fs.readFileSync("./private/ssh.key"),
}

let jermaFiles: object[], jermaClips: any[];
let scpClient: scp.ScpClient;

// #region bigData
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
    await sleep(10, Time.second);
    bigDataTemp = null;
}
// #endregion bigData

// #region extension/helper functions 
function sendTo(target : dc.Message | dc.TextBasedChannel, content : string, ping : boolean = false, files : string[] = []) : Promise<dc.Message> | undefined {
    content = String(content);
    const length = content.length;
    if (length === 0 && files?.length == 0) {
        content = "can't send an empty message!";
    } else if (length > 2000) {
        content = content.slice(0, 2000 - (length.toString().length + 12)) + ` + ${length} more...`
    }
    const replyObj = { content: content, allowedMentions: { repliedUser: (ping) } };
    if (files?.length !== 0) replyObj["files"] = files;
    
    if ((target as dc.Message).reply !== undefined) {
        return (target as dc.Message).reply(replyObj);
    } else if ((target as dc.TextChannel).send !== undefined) {
        return (target as dc.TextChannel).send(replyObj);
    }
}

function debugLog(content : any) {
    if (debugMode) {
        if (typeof content === typeof Object) {
            content = JSON.stringify(content, null, "\t")
        } else if (typeof content !== typeof String) {
            content = String(content);
        }
        console.info(content);
    }
}

// it's funny cuz most of the time this beats out the alternatives
function newObj(obj : object) {
    return JSON.parse(JSON.stringify(obj));
}

function _sGet(target: any) {
    let id = target;
    if (typeof target !== typeof String) {
        id = target?.guildId ?? target?.guild.id ?? target?.id;
    }
    if (typeof id === typeof String) {
        throw new Error("typeof " + typeof target + " not accepted into _sGet!");
    }
    if (!_s.hasOwnProperty(id)) {
        console.warn("server with id " + id + " doesn't have an _s object! giving it one now.");
        _s[id] = newObj(_s["default"]);
    }
    
    return _s[id];
}

// converts from seconds to minutes, hours to ms, minutes to days, etc.
function convertTime(time = 0, typeFrom : Time = Time.second, typeTo : Time = Time.millisecond) {
    if (typeTo === typeFrom) return time;

    let modifier = 1;
    const converts = [ 1000, 60, 60, 24, 7];

    for (let i = mathjs.min(typeFrom, typeTo); i < mathjs.max(typeFrom, typeTo); i++) {
        modifier *= converts[i];
    }

    return (typeFrom > typeTo) ? (time * modifier) : (time / modifier);
}

// #endregion extension/help functions

// #region save/load
async function autoSave() {
    await sleep(1, Time.minute);
    console.info("Autosaving...");
    await save().catch(error => console.error("Autosave failed!\n" + error));
    autoSave();
}

async function save() {
    if (!PERSIST) return;
    fs.writeFileSync(PersistPaths.server,  JSON.stringify({ ..._s }, null, '\t'), null);
    fs.writeFileSync(PersistPaths.user,    JSON.stringify({ ..._u }, null, '\t'), null);
    // fs.writeFileSync(PersistPaths.persist, JSON.stringify({ 0: allTimeouts }, null, '\t'), null);
    const date = new Date();
    const times : number[] = [ date.getHours(), date.getMinutes(), date.getSeconds() ];
    const timeText : string[] = [];
    for (let i = 0; i < times.length; i++) {
        timeText.push(times[i].toString());
        if (timeText[i].length < 2) timeText[i] = "0" + timeText[i];
    }
    console.info(`The file was saved! (${timeText.join(':')})`);
}

async function load() {
    if (!PERSIST) return;
    console.info("Start loading from JSON...");
    const newDefaults : string[] = [];
    const before = performance.now();
    const datas = [ [_s, {}], [_u, {}] ];
    const pathKeys = [ "server", "user" ];
    for (let i = 0; i < datas.length; i++) {
        console.info(`Start loading ${pathKeys[i]} object from JSON...`);
        let data : string = "";
        const path = PersistPaths[pathKeys[i]]
        if (fs.existsSync(path)) {
            data = (fs.readFileSync(path, 'utf-8'));
        }

        if (data) {
            datas[i][1] = JSON.parse(data);
            console.info("The file was loaded!");

            function defaultCheck(obj : object, objAdd : object, root : string) {
                Object.keys(obj).forEach(key => {
                    const value = obj[key];
                    const newKey = (root === "") ? (key) : (root + "/" + key);
                    if (typeof value === typeof Object && value !== null) { // if it's an object, set up the root and iterate through it
                        defaultCheck(value, objAdd, newKey);
                    } else {                                                // otherwise just add it to the object to check it
                        objAdd[newKey] = value;
                    }
                });
            }

            const dataCheck = {}; // the object that will get the paths for every key of the persist files
            const serverCheck = {}; // the object that will get the paths for every key of the persist object defaults
            defaultCheck(datas[i][1]["default"], dataCheck,   "");
            defaultCheck(datas[i][0]["default"], serverCheck, "");

            // const check1 = Object.keys(dataCheck);
            // const check2 = Object.keys(serverCheck);

            // const all    = _.union(check1, check2);
            // const common = _.intersection(check1, check2);
            // const answer = _.difference(all, common);
            // debugLog(all)
            // debugLog(common)
            // debugLog(answer)
        }
    }

    client.guilds.cache.forEach(guild => {
        if (!datas[0][1].hasOwnProperty(guild.id)) { // if there's no server object
            console.info("Guild with id \"" + guild.id + "\" set to default");
            // as long as things aren't undefined, a function, or a new Date(), this is a better way to do things (otherwise use structuredClen)
            _s[guild.id] = newObj(_s["default"]);
        } else {                                 // if there is a server object
            console.info("LOADED guild with id \"" + guild.id + "\"");
            _s[guild.id] = datas[0][1][guild.id];

            // uses the newDefaults array to grab keys
            let tempObjs : object[];
            for (let i = 0; i < newDefaults.length; i++) {
                tempObjs = [ _s[guild.id], _s.default ]
                const keys = newDefaults[i].split('/');
                let j: number = 0;
                for (j = 0; j < keys.length - 1; j++) {
                    // tempObjs = [ tempObjs[0][keys[j]], tempObjs[1][keys[j]] ];
                    tempObjs.map(obj => obj[keys[j]]);
                }
                console.log("\n---------------------------\n");
                tempObjs[0][keys[j]] = tempObjs[1][keys[j]];
            }
        }
    })
    debugLog("Took " + ((performance.now() - before) / 1000) + " milliseconds to finish loading from JSON");
}
// #endregion save/load

async function sleep(time : number, convert : Time = Time.millisecond) : Promise<void> {
    if (convert !== Time.millisecond) time = convertTime(time, convert, Time.millisecond) // always wanna keep it milliseconds
    debugLog("sleep for " + time + " milliseconds")
    return new Promise<void>((resolve) => setTimeout(resolve, time));
}

async function kill() {
    await save();
    await client.destroy();
    process.exit();
}

// #region classes
class Command {
    genre : string
    desc: string
    func : { (message: dc.Message<boolean>, p: object): Promise<void> };
    params : Param[]
    inf : Param // inf param, undefined if it isn't defined in params
    limitedTo: string[][] // first array is user ids, second is permissions
    timeout: number
    currentTimeout: number
    constructor(genre: string, desc: string, func : { (message: dc.Message<boolean>, p: object): Promise<void> }, params: Param[] = [], limitedTo : string[][] = [null,null,null], timeout = 0) {
        // checking for length is kinda lame so just make it null if it doesn't exist or if it's an empty array
        for (let i = 0; i < 2; i++) {
            if (limitedTo[i]?.length) limitedTo[i] = null;
        }
        this.genre = genre;
        this.desc = desc;
        this.func = func;
        this.limitedTo = limitedTo;
        this.timeout = timeout;
        this.currentTimeout = 0;

        // handle infParam stuff
        this.inf = params.find(x => x.name === "params");
        if (this.inf !== undefined) {
            let index = params.indexOf(this.inf); 
            this.params = params.splice(index, index); // removes just the inf params parameter
        } else {
            this.params = params;
        }
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
        this.type = typeof (type ?? preset)
    }
}
// #endregion classes

const _s = {
    "default" : {
        commands: {}, // really just for timeouts for now

        count: {
            channel : null,
            current: 0,      // the last number said that was correct
            prevNumber: 0,   // used to reset back to the last number if i messed up my code
            highestNum: 0,   // the highest number ever gotten to
            lastCounter: "", // used to check for duplicates
        },
        
        chain: {
            channel: null,
            current: "",     //
            chainLength: 0,  //
            prevChain: "",   // used to reset back to the last chain if i messed up my code
            lastChainer: "", // used to check for duplicates
            autoChain: 0,    // the amount of messages in any channel to start a chain
        },

        convo: {
            convoChannel: null, // the channel people are speaking in
            replyChannel: null, // the channel where you reply to the people speaking
        },

        mwuah1: {
            mwuah2: "hehehe",
            mwuah3: {
                mwuah4 : "hehehehe",
            },
        },
    },
};
const _u = {
    "default" : {
        silly: -1,
        eco: {
            bal: 0,
            inv: [],
        }
    }
};

process.on('SIGINT', async () => {
    await kill();
});

// #region counting/chain stuff
async function resetNumber(message: dc.Message<boolean>, reply = 'empty. astrl screwed up lol', react = '💀') {
    const count = _sGet(message).count;
    if (count.currentNum > count.highestNum) count.highestNum = count.currentNum;
    count.lastCounter = '';
    count.prevNumber = count.currentNum;
    count.currentNum = 0;
    await message.react(react);
    await sendTo(message, reply);
}

async function chainFunc(message: dc.Message<boolean>, inRow: string | number) {
    debugLog("First " + inRow);
    const chain = _sGet(message).chain;
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
    debugLog(chain);
    debugLog(inRow);
}
// #endregion counting/chain stuff

// #region client events
// when the client is ready, run this code
client.once(dc.Events.ClientReady, async c => {
    console.info(`Ready! Logged in as ${c.user.tag}`);
    await load();
    autoSave();
});

client.on(dc.Events.GuildCreate, guild => {
    console.log("Joined a new guild: " + guild.name);
    void _sGet(guild.id);
});

client.on(dc.Events.MessageCreate, async (msg) => {
    // if (message.author.id !== "438296397452935169") return; // testing mode :)
    if (msg.author.bot) return;

    const commandFromMessage = msg.content.split(' ')[0].substring(config.prefix.length);
    const id = msg.author.id;

    if (!_u.hasOwnProperty(id)) {
        _u[id] = newObj(_u["default"]);
    }

    const userData = _u[id];

    // #region command handler
    if (msg.content.startsWith(config.prefix) && commands.hasOwnProperty(commandFromMessage)) {
        // 5% chance to happen, if this person is in sillyObj
        if (((userData.silly === 0 && mathjs.random()) || userData.silly > 0)) {
            switch (userData.silly) {
                case 0:
                    await sendTo(msg, "huh? speak up next time buddy.");
                    userData.silly++;
                    return;
                case 1:
                    if (msg.content === msg.content.toUpperCase()) {
                        userData.silly = 0;
                    } else {
                        const replies : string[] = [
                            "SPEAK UP!!! CAN'T HEAR YOU!!!!",
                            "dude what did i JUST tell you. ugh.",
                            "*ALL*. *UPPERCASE*. OR ELSE I *CAN'T* HEAR YOU",
                            "",
                        ]
                        await sendTo(msg, replies[_.random(0, replies.length - 1)]);
                    }
                    return;
                default:
                    userData.silly = 0;
                    break;
            }
        }
        await parseCommand(msg, msg.content, commandFromMessage, commands);
        return;
    }
    // #endregion

    // #region counting and chain handler
    const count = _sGet(msg).count;

    if (msg.channel.id === count.channel?.id) {
        let num = 0;
        const content = String(wordsToNumbers(msg.content));

        try {
            num = mathjs.evaluate(content);
        } catch (error) {
            if (Number(content[0])) {
                const chars : string[] = [];
                let i = 0;
                while (!isNaN(parseInt(content[i])) && i < 50) {
                    chars.push(content[i]);
                    i++;
                }
                num = mathjs.evaluate(chars.join(''));
            } else return;
        }
        
        if (count.lastCounter === id) {
            resetNumber(msg, "uhhh... you know you can't count twice in a row, right??");
            return;
        }

        if (num === count.current + 1) {
            msg.react('✅');
            count.lastCounter = id;
            count.current++;
            debugLog("Count current : " + _sGet(msg).count.current);
        } else {
            resetNumber(msg, (count.prevNumber < 10) ?
                "you can do better than THAT..." :
                'you got pretty far. but i think you could definitely do better than ' + count.highestNum + '.'
            );
        }
    } else if (msg.channel.id === _sGet(msg).chain.channel) {
        await chainFunc(msg, 3);
    } else if (_sGet(msg).chain.autoChain >= 0) {
        //chainFunc(message, chain.autoChain);
    }
    if (_sGet(msg).convo.convoChannel?.id === msg.channel.id) {
        const replyChannel = _sGet(msg).convo.replyChannel;
        await sendTo(replyChannel, `${msg.author.displayName}[:](${msg.url})`);
    } else if (_sGet(msg).convo.replyChannel?.id === msg.channel.id) {
        await sendTo(_sGet(msg).convo.convoChannel, msg.content);
    }
    // #endregion
});
// #endregion client events

// #region command helper functions
async function parseCommand(msg: dc.Message<boolean>, content: string, command: string, comms: object) : Promise<Command>
{
    if (!comms.hasOwnProperty(command)) {
        console.error("Nope. No " + command + " here.");
        return null;
    }
    const timeBefore : number = performance.now();
    const com : Command = comms[command];
    const permissions : string[] = msg.member.permissions.toArray();

    const trusted : boolean = trustedUsers.includes(msg.author.id);
    const notLimited : boolean = com.limitedTo[0] == null || com.limitedTo[0]?.includes(msg.author.id);
    const hasPerms : boolean = (_.intersection(com.limitedTo[1], permissions)).length > 0;

    debugLog(msg.author.username + " -- trusted : " + trusted + ", notLimited : " + notLimited + ", hasPerms : " + hasPerms);

    // if not limited to anybody, if limited to the message author/their permissions, or if user is fully trusted
    if (trusted || notLimited || hasPerms) {
        const dateNow = Date.now(); // actually really good for global time so that i don't need to persist it
        if (com.currentTimeout > dateNow) { // handle command timeout if needed, will send a message to tell the commander there's a timeout then delete once the command is ready, or in 5 seconds
            const timeToWait = com.currentTimeout - dateNow;
            const timeToWaitReply = timeToWait < 1000 ? timeToWait + " milliseconds" : mathjs.round(timeToWait / 1000) + " seconds";
            const timeoutReply = await sendTo(msg, "gotta wait " + timeToWaitReply + ". lol.");
            await sleep(mathjs.min(timeToWait, convertTime(5, Time.second, Time.millisecond))); // hurrah for convertTime()
            timeoutReply.delete();
            return com;
        }
        // #region parameter stuff
        const paramObj = { params : [] }; // an object with the values of parameters assigned to the name of parameters
        const space = '↭'; // will always use the same character for replacing spaces (also look at that freak. why he so wobbly)
        if (content.indexOf(' ') > -1) { // if message contains space, assume it contains parameters
            let tempParameters: string[] = [];
            
            if (content.indexOf('"') > -1) {
                const quoteSplit = content.split('"');
                for (let i = 0; i < quoteSplit.length; i++) { 
                    // check every other section (they will always be in double quotes) and check if it actually has spaces needed to be replaced
                    if (i % 2 === 1 && quoteSplit[i].indexOf(' ') > -1) {
                        quoteSplit[i] = quoteSplit[i].split(' ').join(space); // most reliable way to replace all spaces with the temporary space character
                    }
                }
                tempParameters = quoteSplit.join('').split(' '); // join everything back together then split it up as parameters
            } else {
                tempParameters = content.split(' ');
            }
            
            tempParameters.shift(); // remove the first element (the command) from the parameters

            function convParam(content: string, paramType: any) : any {
                switch (paramType) {
                    case "string" : return String(content); // just for safety :)
                    case "number" : return Number(content);
                    case "boolean": return content === "true";
                    default: console.error("Type " + paramType + " not supported! Did something go wrong or do you need to add another case?"); 
                        break;
                }
            }

            let i = 0; // less strict scope cuz i need to use it in the second loop
            let j = 0; // funny second iterator variable
            while (i < mathjs.min(com.params.length, tempParameters.length)) {
                // i've searched so much but this is the best way i can find to convert to the preset's type
                // convert space character back to actual spaces, if it needs them
                if (tempParameters[i].indexOf(space) > -1) {
                    tempParameters[i] = tempParameters[i].split(space).join(' ');
                }
                // decides if the current param is being manually set or not, and assigns the paramObj accordingly
                if (tempParameters[i].indexOf(':') > -1) {
                    const halves = tempParameters[i].split(':');

                    if (halves[0] === "params") { // start setting inf params if content is "params:"
                        if (!com.inf) {
                            await sendTo(msg, "that command doesn't support params, bee tee dubs", true);
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
                    const paramNum = Number(halves[0]);
                    const param = isNaN(paramNum) ? com.params.find(x => x.name === halves[0]) : com.params[paramNum];
                    
                    if (param !== undefined) {
                        paramObj[param.name] = convParam(halves[1], param.type) ?? param.preset;
                    }
                } else {
                    const param = com.params[j];
                    paramObj[param.name] = convParam(tempParameters[i], param.type)
                    console.log(com.params[j]);
                    j++;
                }
                i++;
            }

            if (com.inf && (i < tempParameters.length)) {
                while (i < tempParameters.length) {
                    console.log("paramObj.params : " + paramObj.params);
                    console.log("typeof paramObj.params : " + typeof paramObj.params);
                    paramObj.params.push(convParam(tempParameters[i], typeof (com.params["params"])));
                    debugLog(`param ${tempParameters[i]}`);
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
            const comTime = performance.now();
            com.currentTimeout = (Date.now() + com.timeout);
            debugLog(`Took ${comTime - timeBefore} milliseconds to complete parsing message`);
            await com.func(msg, paramObj);
            debugLog(`Took ${performance.now() - comTime} milliseconds to finish function`);
        } catch (error) {
            console.error(error);
            await sendTo(msg, error, false);
        }
    } else {
        await sendTo(msg, 'hey, you can\'t use this command!');
    }
    return com;
}

function listCommands(commandObj : object, listDescs : boolean = false, singleCom : string = "", showHidden : number = 0) : string
{
    if (singleCom && !commandObj.hasOwnProperty(singleCom)) {
        return `${singleCom} is NOT a command. try again :/`;
    }
    const response: string[] = [];
    const coms : string[] = singleCom ? [ singleCom ] : Object.keys(commandObj);
    for (let i = 0; i < coms.length; i++) {
        const com : Command = commandObj[coms[i]];
        const hidden = com.genre === "hidden";
        if (showHidden !== 1 && ((hidden && showHidden === 0) || (!hidden && showHidden === 2))) continue;
        const paramNames = Array.from(com.params, x => x.name);

        response.push(`$${coms[i]} (${paramNames.join(', ')}) : ${com.desc}\n`);
        
        if (listDescs) {
            const params = [];
            com.params.forEach(x => params.push(`-${x.name} (${x.preset} : ${String(x.type)}) : ${x.desc}\n`));
            response.push(params.join(''));
        }
    }

    // #region new stuff
    const pages : string[][] = [];
    let page : number = 0;
    let pageLength : number = 0;
    for (let i = 0; i < response.length; i++) {
        pageLength += response[i].length;
        if (pageLength > 2000) {
            pageLength = 0;
            page++;
        }
        pages[page].push(response[i]);
    }
    // #endregion
    
    return response.join('');
}
// #endregion command helper functions

const genres = {};
// used to cache data like the help command, so that resources aren't wasted generating it again
// it isn't persistent, so data like the help command will get regenerated (good for if a new command is added/modified)
const commandData = {};
const commands = {
    "help" : new Command("bot/support", "lists all commands", async function (msg: dc.Message<boolean>, p) {
        const reply = listCommands(commands, p["paramDescs"], p["whichCommand"]);
        await sendTo(msg, reply);
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ]),

    // #region novelty
    "echo" : new Command("general/fun", "echoes whatever's in front of it", async function (msg: dc.Message<boolean>, p) {
        try {
            await sleep(p["waitValue"], findTime(p["waitType"]));
            await sendTo(msg.channel, p["reply"]);
            if (p["delete"]) msg.delete();
        } catch (error) {
            await sendTo(msg.channel, error);
        }
    }, [
        new Param("reply", "the message to echo back to you", "..."),
        new Param("waitValue", "the time it will take to echo back your message", 0),
        new Param("waitType", "i.e ms (milliseconds), s (seconds), m (minutes)", 'ms'),
        new Param("delete", "deletes message after sending", false),
    ]),

    "math" : new Command("general/fun", "does the math put in front of it", async function (msg: dc.Message<boolean>, p) {
        try {
            await sendTo(msg, mathjs.evaluate(p["equation"]));
        } catch (error) {
            await sendTo(msg, error);
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ]),

    "mathClass" : new Command("general/fun", "this is for school lol", async function (msg: dc.Message<boolean>, p) {
        const feet = [];
        const inches = [];
        for (let i = 0; i < p["params"].length; i++) {
            (i % 2 === 0 ? feet : inches).push(Number(p["params"][i]));
        }
        const newStuff = [];
        for (let i = 0; i < feet.length; i++) {
            const modRad = (((feet[i] * 12) + inches[i]) / (Math.PI * 2));
            debugLog(modRad);
        }

        await sendTo(msg, newStuff.join("\n"));
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
        new Param("params", "the numbers to use in the math", "undefined"),
    ]),

    "jerma" : new Command("general/fun", "Okay, if I... if I chop you up in a meat grinder, and the only thing that comes out, that's left of you, is your eyeball, you'r- you're PROBABLY DEAD!", async function (msg: dc.Message<boolean>, p) {
        switch (p["fileType"]) {
            case 0: {
                if (os.hostname() !== "hero-corp") {
                    await sendTo(msg, "sorry, jerma 0 only works on astrl's main pc. im being hosting from somewhere else rn")
                    return;
                }
                const reaction = msg.react('✅');
                if (!scpClient) scpClient = await scp.Client(remote_server);
                await scpClient.list('/home/opc/mediaHosting/jermaSFX/').then(x => x.forEach(x => debugLog(JSON.stringify(x))));
                if (!jermaFiles) jermaFiles = await scpClient.list('/home/opc/mediaHosting/jermaSFX/');
                const result = `./temp/${p["fileName"]}.mp3`;
                const index = Math.round(Math.random() * jermaFiles.length - 1);
                console.log(jermaFiles[index])
                await scpClient.downloadFile(`/home/opc/mediaHosting/jermaSFX/${jermaFiles[index]["name"]}`, result);
                console.log("2")
                await sendTo(msg.channel, "", true, [result]);
                // await msg.channel.send({files: [result]});
                fs.unlinkSync(result);
                try {
                } catch (error) {
                    console.error(error);
                    await reaction;
                    await msg.reactions.removeAll().catch(error => console.error('Failed to remove reactions:\n', error));
                    await msg.react('❌');
                }
            } break;
            case 1: {
                if (!jermaClips) { // this changed randomly at one point, idk why. makes things look better though
                    const tempClips = await google.youtube('v3').playlistItems.list({
                        auth: config.ytApiKey,
                        part: [ 'id', 'snippet' ], playlistId: 'PLBasdKHLpmHFYEfFCc4iCBD764SmYqDDj', maxResults: 1000,
                    });
                    jermaClips = tempClips.data.items
                }
                const index = Math.round(Math.random() * jermaClips.length - 1);
                await sendTo(msg, (`[${jermaClips[index].snippet.title}](https://www.youtube.com/watch?v=${jermaClips[index].snippet.resourceId.videoId})`));
            } break;
            default:
                await sendTo(msg, (`type "${p["fileType"]}" not supported!`));
                break;
        }
    }, [
        new Param("fileType", "the type of jerma file", 0),
        new Param("fileName", "the name of the resulting file", "jerma so silly"),
    ]),

    "convertTime" : new Command("hidden", "converts time", async function(msg: dc.Message<boolean>, p) {
        const newTime = convertTime(p["time"], p["typeFrom"], p["typeTo"]);
        await sendTo(msg, (`${p["time"]} ${p["typeFrom"]} is ${newTime} ${p["typeTo"]}`));
    }, [
        new Param("time", "", 0),
        new Param("typeFrom", "the time to convert from", "s"),
        new Param("typeTo",   "the time to convert to",   "s"),
    ]),
    // #endregion novelty

    // #region reactions
    "mock" : new Command("general/fun", "mocks text/whoever you reply to", async function (msg: dc.Message<boolean>, p) {
        async function getMessage() {
            const messages = await msg.channel.messages.fetch({ limit: 2 });
            const lastMessage = messages.last() ?? await getMessage();
            return lastMessage;
        }

        const reference = p["reply"] !== "" ? msg : await (msg.reference !== null ? msg.fetchReference() : getMessage());
        const toMock    = p["reply"] !== "" ? p["reply"] : reference.content;

        const mock = [];
        for (let i = 0; i < toMock.length; i++) {
            const vary = i % 2 === 0;
            // if (p["variance"] !== 0) {
            //     let vary = i % 2 === 0;
            // }

            // let vary;
            // if (mock[i - 1] === mock[i - 1].toLowerCase()) {
            //     vary = ;
            // }
            mock.push(vary ? toMock[i].toLowerCase() : toMock[i].toUpperCase());
        }
        
        await sendTo(p["reply"] === "" ? reference : reference.channel, mock.join(''));

        await msg.delete();
    }, [
        new Param("reply", "the message to mock", ""),
        new Param("variance", "the amount of variance in the mocking (INITIALIZATION ONLY)", 0),
        new Param("message", "the message id to mock", ""),
    ]),

    "true" : new Command("general/fun", emojis.true, async function (msg: dc.Message<boolean>, p) {
        let reference: dc.Message<boolean>;
        try {
            reference = await msg.fetchReference();
            await msg.delete();
        } catch {
            await msg.delete();
            const messages = await msg.channel.messages.fetch({ limit: 1 });
            reference = messages.first();
        }

        const bigData = getBigData();
        
        for (let i = 0; i < Math.min(p["amount"], bigData.trueEmojis.length); i++) {
            try {
                await reference.react(bigData.trueEmojis[i]);
            } catch (error) {
                console.error("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you agree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ], [], 10000),

    "false" : new Command("hidden", "<:false:1123469352826576916>", async function (msg: dc.Message<boolean>, p) {
        let reference: dc.Message<boolean>;
        try {
            reference = await msg.fetchReference();
            await msg.delete();
        } catch {
            await msg.delete();
            const messages = await msg.channel.messages.fetch({ limit: 1 });
            reference = messages.first();
        }
        
        const bigData = getBigData();
        for (let i = 0; i < Math.min(p["amount"], bigData.trueEmojis.length); i++) {
            try {
                await reference.react(bigData.trueEmojis[i]);
            } catch (error) {
                console.error("$true broke lol");
                break;
            }
        }
    }, [
        new Param("amount", `the amount you disagree with this statement (capped at ${getBigData().trueEmojis.length})`, getBigData().trueEmojis.length),
    ]),
    // #endregion reactions

    // #region count/chain stuff
    "countChannel" : new Command("patterns/counting", "sets the current channel to be the channel used for counting", async function (msg: dc.Message<boolean>, p) {
        let channel = msg.channel as dc.TextChannel;
        if (p["channel"]) {
            try {
                channel = await client.channels.fetch(p["channel"]) as dc.TextChannel;
            } catch (error) {
                try {
                    channel = msg.guild.channels.cache.find(channel => channel.name.toLowerCase() === p["channel"].toLowerCase()) as dc.TextChannel;
                } catch (error) {
                    await msg.react('❌');
                    return;
                }
            }
        }
        msg.react('✅');
        
        const countChannel = _sGet(msg).count.channel;
        const test = countChannel !== null && channel.id === countChannel.id;
        await sendTo(channel, test ? `counting in ${channel.name.toLowerCase()} has ceased.` : `alright, count in ${channel.name.toLowerCase()}!`);
        _sGet(msg).count.channel = test ? null : channel;
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [[ "438296397452935169" ]]),

    "chainChannel" : new Command("patterns/chaining", "sets the current channel to be the channel used for message chains", async function (msg: dc.Message<boolean>, p) {
        let channel = msg.channel as dc.TextChannel;
        if (p["channel"]) {
            try {
                channel = await client.channels.fetch(p["channel"]) as dc.TextChannel;
            } catch (error) {
                try {
                    channel = msg.guild.channels.cache.find(channel => channel.name.toLowerCase() === p["channel"].toLowerCase()) as dc.TextChannel;
                } catch (error) {
                    await msg.react('❌');
                    return;
                }
            }
        }
        msg.react('✅');

        if (channel.id === _sGet(channel).count.channel.id) {
            await sendTo(channel, `counting in ${channel.name.toLowerCase()} has ceased.`);
            _sGet(channel).count.channel = null;
        } else {
            await sendTo(channel, `alright, count in ${channel.name.toLowerCase()}!`);
            _sGet(channel).count.channel = channel;
        }

        // old stuff here
        const channelId = p["channel"] ? p["channel"] : msg.channel.id;
        const isChannel = _sGet(msg).chain.channel === channelId;

        _sGet(msg).chain.channel = isChannel ? "" : channelId;
        channel = client.channels.cache.get(channelId) as dc.TextChannel;
        await sendTo(channel, isChannel ? 'the chain in this channel has been eliminated.' : 'alright. start a chain then.')
                .catch(async err => await sendTo(msg, err));
    }, [
        new Param("channel", "the specific channel to start counting in", "")
    ], [ [ "438296397452935169" ] ]),

    "autoChain" : new Command("patterns/chaining", "will let any channel start a chain", async function (msg: dc.Message<boolean>, p) {
        _sGet(msg).chain.autoChain = p["howMany"];
        debugLog(_sGet(msg).chain.autoChain);
        await sendTo(msg, (`autoChain is now ${_sGet(msg).chain.autoChain}.`));
    }, [
        new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)
    ], [ [ "438296397452935169" ] ]),
    // #endregion count/chain

    "slowMode" : new Command("server/channels", "artifically makes a slowmode, which means even admins can't get around it.", async function(msg, p){
        await sendTo(msg, "wowza! you can manage channels. (no clue if this works so tell me if you can't. please)");
        // p["params"].forEach(x => console.log(x));
    }, [
        new Param("params", "the channel ids affected", "")
    ], [ [], [ "ManageChannels" ] ]),

    "cmd" : new Command("hidden", "astrl only!! internal commands that would be dangerous to let everybody use", async function (msg: dc.Message<boolean>, p) {
        const cont = msg.content.substring(msg.content.indexOf(' ') + 1)
        await parseCommand(msg, cont, cont.split(' ')[0], cmdCommands);
    }, [], [ [ "438296397452935169" ] ]),
}

// for more internal purposes; really just for astrl lol
const cmdCommands = {
    "help" : new Command("bot/support", "lists all cmd commands", async function (msg: dc.Message<boolean>, p) {
        const reply = listCommands(cmdCommands, p["paramDescs"], p["whichCommand"]);
        await sendTo(msg, (reply));
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ]),

    "resetCount" : new Command("patterns/counting", "resets the current count", async function (msg: dc.Message<boolean>, p) {
        resetNumber(msg, 'reset the count!', '✅');
    }, []),

    "debug" : new Command("bot", "turns on/off debug mode (basically just sends more messages into the console)", async function (msg: dc.Message<boolean>, p) {
        debugMode = !debugMode;
        await msg.react('✅');
    }),

    // #region messaging
    "send" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (msg: dc.Message<boolean>, p) {
        try {
            const guild = client.guilds.cache.get(p["guild"]);
            if (guild !== undefined) {
                const channel = guild.channels.cache.get(p["channel"]) as dc.TextChannel;
                await sendTo(channel, p["message"]);
            }
        } catch (error) {
            await sendTo(msg, "dumbass\n"+error)
        }
    }, [
        new Param("message", "the message to send into the channel", "hey guys spam ping astrl in half an hour. it would be really really funny " + emojis.smide),
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ]),

    "convo" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (msg: dc.Message<boolean>, p) {
        try {
            const guild : dc.Guild = client.guilds.cache.get(p["guild"]);
            if (guild !== undefined) {
                const channel = guild.channels.cache.get(p["channel"]);
                _sGet(msg).convo.convoChannel = channel
                _sGet(msg).convo.replyChannel = msg.channel
            }
        } catch (error) {
            await sendTo(msg, "dumbass\n"+error)
        }
    }, [
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ]),
    // #endregion messaging

    "restart" : new Command("bot", "restarts the bot", async function (msg: dc.Message<boolean>, p) {
        await sendTo(msg.channel, 'bot is restarting');
        await save();
        await client.destroy();
    }),

    "kill" : new Command("bot", "kills the bot", async function (msg: dc.Message<boolean>, p) {
        await sendTo(msg.channel, 'bot is now dead 😢');
        await kill();
    }),

    // #region code stuff
    "save" : new Command("bot", "saves the bot's data", async (m, p) => await save()),
    "load" : new Command("bot", "loads the bot's data", async (m, p) => await load()),

    "eval" : new Command("general/fun", "runs javascript code from a string", async function (msg1: dc.Message<boolean>, p) {
        const cont = msg1.content;
        let reaction : Promise<dc.MessageReaction>;
        try {
            reaction = msg1.react('✅');
            const code = cont.substring(cont.indexOf(' ', cont.indexOf(' ') + 1) + 1);
            const msg = msg1; // the only way to get the message in eval (why?? idk. it was working before)
            const codeReturn = await eval(code);
            console.log(codeReturn);
        } catch (error) {
            await reaction.then(async reaction => {
                await reaction.remove();
                await msg1.react('❌');
                await sendTo(msg1, (error));
            })
        }
    }),

    "evalReturn" : new Command("general/fun", "runs javascript code from a string", async function (msg1: dc.Message<boolean>, p) {
        const cont = msg1.content;
        let reaction : Promise<dc.MessageReaction>;
        try {
            reaction = msg1.react('✅');
            const code = cont.substring(cont.indexOf(' ', cont.indexOf(' ') + 1) + 1);
            const msg = msg1; // refer to $eval for why this exists
            const codeReturn = await eval(code);
            await sendTo(msg1, codeReturn)
        } catch (error) {
            await reaction.then(async reaction => {
                await reaction.remove();
                await msg1.react('❌');
                await sendTo(msg1, (error));
            })
        }
    }),

    "didAnythingBreak?" : new Command("hidden", "just testing every command until something breaks", async function (msg: dc.Message<boolean>, p) {
        // this is silly and doesn't really work lol
        const keys = Object.keys(commands);
        for (let i = 0; i < keys.length; i++) {
            await sendTo(msg, ("testing command " + keys[i]))
            await sleep(1, Time.second);
            await parseCommand(msg, (config.prefix + keys[i]), keys[i], commands);
            await sleep(1, Time.second);
        }

        await sendTo(msg, "finished!");
    }),

    "sanityCheck" : new Command("hidden", "do several checks on all the commands to make sure they're up to snuff", async function(msg: dc.Message<boolean>, p) {
        const overlaps = [];
        const reply : string[] = []
        const keys = Object.keys(commands)
        for (let i = 0; i < keys.length; i++) {
            const params : Param[] = commands[keys[i]].params;
            params.forEach(x => {
                params.forEach(y => {
                    if (x.name === y.name && x !== y) {
                        overlaps.push(`${x.name} (preset : ${x.preset}) : ${x.desc}`);
                    }
                });
            });
            if (params.find(x => x.name === "params") && params[params.length - 1].name !== "params") {
                reply.push(keys[i] + " has its inf params parameter in the wrong place!");
            }
        }
        reply.push(overlaps.length > 0 ?
            "overlaps:\n" + overlaps.join('\n') +"\nastrl u dumbass" : 
            "no overlaps here! wow isn't astrl such a good programmer" + emojis.smide);
        await sendTo(msg, (reply.join('\n')));
    }, [
        // new Param("doubleUp", "desription on", 52),
        // new Param("doubleUp", "descirtpn dos", "this is a default"),
    ]),
    // #endregion

    // keep this at the bottom, i just want easy access to it
    "test" : new Command("bot", "various things astrl will put in here to test node.js/discord.js", async function (msg: dc.Message<boolean>, p) {
        // let first = performance.now();
        // for (let i = 0; i < 5000; i++) {
        //     newObj(_s["default"]);
        // }
        // let middle = performance.now();
        // for (let i = 0; i < 5000; i++) {
        //     structuredClone(_s["default"]);
        // }
        // let end = performance.now();
        // await sendTo(msg, "JSON stringify + parse took " + ((middle - first)) + " milliseconds to complete");
        // await sendTo(msg, "structuredClone took " + ((end - middle)) + " milliseconds to complete");

        let testObj1 = {
            "layer1str": "1",
            "layer2": {
                "layer2str": "2",
                "layer3": {
                    "layer3str": "3"
                },
            },
        }

        let testObj2 = {
            "layer1str": "1",
            "layer1str2": "2",
            "layer2" : {
                "layer2str": "3",
                "layer2str2": "4",
                "layer3" : {
                    "layer3str": "5",
                    "layer3str2": "6",
                }
            },
        }

        // let testObjKeysObj = {
        //     "layer1str": "1",
        //     "layer1str2": "2",
        //     "layer2/layer2str": "3",
        //     "layer2/layer2str2": "4",
        //     "layer2/layer3/layer3str": "5",
        //     "layer2/layer3/layer3str2": "6",
        // }

        // let keys = Object.keys(testObjKeysObj);
        const overlaps = [
            "layer1str2",
            "layer2/layer2str2",
            "layer2/layer3/layer3str2",
        ]

        // for (let i = 0; i < overlaps.length; i++) {
        //     const keys = overlaps[i].split('/');

        //     switch (keys.length) { // i hope there's a better way to do this
        //         case 1: testObj1[keys[0]] = testObj2[keys[0]];
        //             break;
        //         case 2: testObj1[keys[0]][keys[1]] = testObj2[keys[0]][keys[1]];
        //             break;
        //         case 3: testObj1[keys[0]][keys[1]][keys[2]] = testObj2[keys[0]][keys[1]][keys[2]];
        //             break;
        //         default: console.error(`cries`)
        //             break;
        //     }
        // }
        

        sendTo(msg, JSON.stringify(testObj1, null, '\t'));
    }, [
        new Param("lol", "use this for anything", ""),
        new Param("params", "how new and innovative!", 0)
    ]),
}
// Log in to Discord with your client's token
client.login(config.token);