// import process from 'node:process';
import fs from 'fs';
import os from 'os';
import scp from 'node-scp';
import dc from 'discord.js';
import _ from 'lodash';
// import brain from 'brain.js';
// import neat from 'neataptic';
import * as mathjs from 'mathjs';
import { wordsToNumbers } from 'words-to-numbers';
import { google } from 'googleapis';

// typescript is weird
declare module 'discord.js' {
    interface Message {
        send(content: string, ping?: boolean, files?: string[]) : Promise<Message<boolean>>;
    }
}
dc.Message.prototype.send = function (content : string, ping : boolean = false, files : string[] = []) : Promise<dc.Message> | undefined {
    return sendTo(this, content, ping, files);
}

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

const trustedUsers : ReadonlyArray<string> = [ // only add to this if you FULLY TRUST THEM
    "438296397452935169", // astrl (me)
    "820357014831628309", // @12u3ie
    // "476021507420586014", // vincells (god this is a terrible idea)
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
    ms = 0,
    sec,
    min,
    hr,
    day,
    week,
}

function findTime(time : string) : number {
    let times = [ 'ms', 's', 'm', 'h', 'd', 'w' ];
    let newTime = times.indexOf(time);
    return newTime;
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
let bigDataTimeout : NodeJS.Timeout;

// exists because i don't want so much data in memory, but i need to use big-data multiple times in a row
function getBigData() {
    if (!bigDataTemp) {
        if (fs.existsSync("./big-data.json")) {
            bigDataTemp = JSON.parse(fs.readFileSync("./big-data.json", 'utf-8'));
        } else {
            throw new Error("Big-data doesn't exist...");
        }
    }
    wipeBigData();
    return bigDataTemp;
}

function wipeBigData() {
    if (!bigDataTimeout) {
        bigDataTimeout = setTimeout(() => { bigDataTemp = null; }, convertTime(10, Time.sec));
    } else {
        bigDataTimeout = bigDataTimeout.refresh();
    }
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
    
    if ((target as dc.Message).reply !== undefined) { // lol
        return (target as dc.Message).reply(replyObj);
    } else if ((target as dc.TextChannel).send !== undefined) {
        return (target as dc.TextChannel).send(replyObj);
    }
}

function debugLog(content : any) {
    if (debugMode) {
        if (typeof content === typeof Object) {
            content = JSON.stringify(content, null, "\t")
        } else if (typeof content !== "string") {
            content = String(content);
        }
        console.info(content);
    }
}

// it's funny cuz most of the time this beats out the alternatives (i.e just structuredClone)
function newObj(obj : object) {
    return JSON.parse(JSON.stringify(obj));
}

// both the below functions get the _s and _u objects respectively, and have some error checking for edge cases
function _sGet(target: any) : typeof _s.default
{
    let id = target;
    if (typeof target !== "string") {
        id = target?.guildId ?? target?.guild.id ?? target?.id;
    }
    if (typeof id !== "string") {
        throw new Error("typeof " + typeof target + " not accepted into _sGet!");
    }
    if (!_s.hasOwnProperty(id)) {
        console.warn("server with id " + id + " doesn't have an _s object! giving it one now.");
        _s[id] = newObj(_s.default);
    }
    
    return _s[id];
}

function _uGet(target: any) : typeof _u.default
{
    let id = target;
    if (typeof target !== "string") {
        id = target?.author.id ?? target?.id;
    }
    if (typeof id !== "string" || isNaN(Number(id))) {
        throw new Error(`argument ${target} not accepted into _uGet!`);
    }
    if (!_u.hasOwnProperty(id)) {
        console.warn("user with id " + id + " doesn't have a _u object! giving them one now.");
        _u[id] = newObj(_u.default);
    }
    
    return _u[id];
}

// converts from seconds to minutes, hours to ms, minutes to days, etc.
function convertTime(time = 0, typeFrom : Time = Time.sec, typeTo : Time = Time.ms) : number {
    if (typeof time !== "number") {
        time = Number(time);
    }
    if (typeTo === typeFrom) return time;

    let modifier = 1;
    const converts = [ 1000, 60, 60, 24, 7];

    for (let i = mathjs.min(typeFrom, typeTo); i < mathjs.max(typeFrom, typeTo); i++) {
        modifier *= converts[i];
    }

    return (typeFrom > typeTo) ? (time * modifier) : (time / modifier);
}

// creates a string of time from milliseconds
function makeTimestamp(time : number = -1) : string {
    if (time < 0) time = new Date().getMilliseconds();
    const tempTimes : number[] = [ time ];
    const times : string[] = [ ];
    const mods = [ 1000, 60, 60, 24, 7 ];
    for (let i = 0; i < mods.length; i++) {
        const thisTime = tempTimes[i] % mods[i];
        times.unshift(thisTime.toString().padStart(mods[i].toString().length, '0'));
        const nextTime = (tempTimes[i] - (thisTime)) / mods[i];
        if (nextTime <= 0) break;
        tempTimes[i] = thisTime
        tempTimes.push(nextTime);
    }
    return times.join(':');
}

function getDate() : string {
    const date = new Date();
    const ms = date.getMilliseconds().toString().padStart(4, '0');
    return `${date.toString().slice(16, 24)}:${ms}`;
}

async function getChannel(identifier: string, defaultChannel : dc.TextBasedChannel) : Promise<dc.TextChannel> {
    let channel = defaultChannel as dc.GuildBasedChannel;
    if (identifier) {
        console.log(identifier);
        console.log(typeof identifier);
        let check = (ch : dc.TextChannel) => ch.name.toLowerCase() === identifier.toLowerCase() || ch.id === identifier;
        channel = channel.guild.channels.cache.find(check);
    }

    return channel as dc.TextChannel;
}

// #endregion extension/help functions

// #region save/load
async function autoSave() {
    await sleep(1, Time.min);
    console.info("Autosaving...");
    await save().catch(error => { throw new Error("Autosave failed!\n" + error) });
    autoSave();
}

async function save() {
    // check if _s has private server id, so that stuff doesn't get overwritten by nothing (janky check but will save me a headache in the future)
    if (!PERSIST || !_s.hasOwnProperty("887502008876167209")) return;
    fs.writeFileSync(PersistPaths.server,  JSON.stringify(_s, null, '\t'), null);
    fs.writeFileSync(PersistPaths.user,    JSON.stringify(_u, null, '\t'), null);
    // fs.writeFileSync(PersistPaths.persist, JSON.stringify({ 0: allTimeouts }, null, '\t'), null);
    console.info(`The file was saved! (${getDate()})`);
}

async function load() {
    if (!PERSIST) return;
    console.info("Start loading from JSON...");
    const before = performance.now();
    // const datas = [ [_s, {}, []], [_u, {}, []] ];
    const objs = [ _s, _u ];
    const datas = [ {}, {} ];
    const newDefaults : string[][] = [ [], [] ];
    const pathKeys = [ "server", "user" ];
    for (let i = 0; i < objs.length; i++) {
        console.info(`Start loading ${pathKeys[i]} object from JSON...`);
        let data : string = "";
        const path = PersistPaths[pathKeys[i]]
        if (fs.existsSync(path)) {
            data = (fs.readFileSync(path, 'utf-8'));
        } else {
            save();
            load();
            return;
        }

        if (data) {
            datas[i] = JSON.parse(data);
            console.info("The file was loaded!");

            function defaultCheck(obj : object, objAdd : object, root : string) {
                Object.keys(obj).forEach(key => {
                    const value = obj[key];
                    const newKey = (root === "") ? (key) : (root + "/" + key);
                    if (typeof value === "object" && value !== null) { // if it's an object, set up the root and iterate through it
                        defaultCheck(value, objAdd, newKey);
                    } else {                                           // otherwise just add it to the object to check it
                        objAdd[newKey] = value;
                    }
                });
            }

            const dataCheck = {}; // the object that will get the paths for every key of the persist files
            const serverCheck = {}; // the object that will get the paths for every key of the persist object defaults
            defaultCheck(datas[i]["default"], dataCheck,   "");
            defaultCheck(objs[i]["default"], serverCheck, "");

            const check1 = Object.keys(dataCheck);
            const check2 = Object.keys(serverCheck);

            newDefaults[i] = _.xor(check1, check2);
        }
    }

    function fillDefaults(objs : object[]) {
        let tempObjs = objs;
        // uses the newDefaults array to grab keys
        for (let i = 0; i < newDefaults[0].length; i++) {
            tempObjs = objs
            const keys = newDefaults[0][i].split('/');
            let j: number = 0;
            for (j = 0; j < keys.length - 1; j++) {
                tempObjs.map(obj => obj[keys[j]]); // get the object of the previous object, and set each to each element
            }
            tempObjs[0][keys[j]] = tempObjs[1][keys[j]];
        }
    }

    client.guilds.cache.forEach(guild => {
        let id = guild.id;
        if (!datas[0].hasOwnProperty(id)) { // if there's no server object
            console.info(`Guild "${guild.name}" with id "${id}" set to default`);
            // as long as things aren't undefined, a function, or a new Date(), this is a better way to do things (otherwise use structuredClone)
            _s[id] = newObj(_s.default);
        } else {                                 // if there is a server object
            console.info(`LOADED guild "${guild.name}" with id "${id}"`);
            _s[id] = datas[0][id];
            fillDefaults([ _s[id], _s.default ]);
        }
    });

    Object.keys(datas[1]).forEach(key => {
        _u[key] = datas[1][key]
        fillDefaults([_u[key], _u.default])
    })

    debugLog("Took " + ((performance.now() - before) / 1000) + " milliseconds to finish loading from JSON");
}
// #endregion save/load

async function sleep(time : number, convert : Time = Time.ms) : Promise<void> {
    if (convert !== Time.ms) time = convertTime(time, convert, Time.ms); // always wanna keep it milliseconds
    debugLog("sleep for " + time + " milliseconds");
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
            if (!limitedTo[i]?.length) limitedTo[i] = null;
        }
        this.genre = genre;
        this.desc = desc;
        this.func = func;
        this.params = params;
        this.limitedTo = limitedTo;
        this.timeout = timeout;
        this.currentTimeout = 0;

        // handle infParam stuff
        this.inf = params.find(x => x.name === "params");
        if (this.inf !== undefined) {
            let index = params.indexOf(this.inf);
            this.params.splice(index, index); // removes just the inf params parameter
        }
    }
}

class Param {
    name: string
    desc: string
    preset: any
    type: string
    constructor(name: string, desc: string, preset: any, type: string = null) {
        this.name = name;
        this.desc = desc;
        this.preset = preset;
        this.type = (type ?? typeof preset)
    }
}

class Item {
    name: string
    desc: string
    price: number
    constructor(name: string, desc: string, price: number) {
        this.name = name;
        this.desc = desc;
        this.price = price;
    }
}
// #endregion classes

const _s = {
    "default" : {
        commands: {}, // really just for timeouts for now

        count: {
            channel : null as dc.TextChannel,  // saved as an id, which the channel of is grabbed at load
            current: 0,      // the last number said that was correct
            prevNumber: 0,   // used to reset back to the last number if i messed up my code
            highestNum: 0,   // the highest number ever gotten to
            lastCounter: "", // used to check for duplicates
        },
        
        chain: {
            channel: null as dc.TextChannel,   // same thing as count.channel
            current: "",     //
            chainLength: 0,  // amount of times this phrase has been repeated
            prevChain: "",   // used to reset back to the last chain if i messed up my code
            lastChainer: "", // used to check for duplicates
            autoChain: 0,    // the amount of messages in any channel to start a chain
        },

        convo: {
            convoChannel: null as dc.TextChannel, // the channel people are speaking in
            replyChannel: null as dc.TextChannel, // the channel where you reply to the people speaking
        },

        slowMode: {
            channel: null as dc.TextChannel,
            timer: 0,
        }
    },
};
const _u = {
    "default" : {
        silly: -1,
        eco: {
            bal: 0,
            inv: [],
        },
        slowMode: {},
    }
};

process.on('SIGINT', async () => {
    await kill();
});

// #region counting/chain stuff

// recoding this rn

// #endregion counting/chain stuff

// #region client events
// when the client is ready, run this code
client.once(dc.Events.ClientReady, async c => {
    console.info(`Ready! Logged in as ${c.user.tag}`);
    await load();
    autoSave();
});

// probably not needed because as soon as a message is sent, _sGet() will be called.
// the performace of newObj is negligible, im pretty sure it takes less than a microsecond
// client.on(dc.Events.GuildCreate, guild => {
//     console.info("Joined a new guild: " + guild.name);
//     void _sGet(guild.id);
// });

client.on(dc.Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    const s = _sGet(msg)
    const u = _uGet(msg)
    
    // if (msg.author.id !== "438296397452935169") return; // testing mode :)

    const commandFromMessage = msg.content.split(' ')[0].substring(config.prefix.length);

    // #region command handler
    if (msg.content.startsWith(config.prefix) && commands.hasOwnProperty(commandFromMessage)) {
        // 5% chance to happen, if this person is in sillyObj
        if (((u.silly === 0 && mathjs.random() > 0.95) || u.silly > 0)) {
            switch (u.silly) {
                case 0:
                    await sendTo(msg, "huh? speak up next time buddy.");
                    u.silly++;
                    return;
                case 1:
                    if (msg.content === msg.content.toUpperCase()) {
                        u.silly = 0;
                    } else {
                        const replies : string[] = [
                            "SPEAK UP!!! CAN'T HEAR YOU!!!!",
                            "dude what did i JUST tell you. ugh.",
                            "*ALL*. *UPPERCASE*. OR ELSE I *CAN'T* HEAR YOU",
                            "...",
                        ]
                        await sendTo(msg, replies[_.random(0, replies.length - 1)]);
                    }
                    return;
                default:
                    u.silly = 0;
                    break;
            }
        }
        debugLog("command message content : " + msg.content);
        await parseCommand(msg, msg.content, commandFromMessage, commands);
        return;
    }
    // #endregion

    // #region counting, chain, convo handler
    const count = s.count, chain = s.chain, convo = s.convo, slowMode = s.slowMode;

    switch (msg.channelId) {
        case slowMode.channel?.id: {
            let id = slowMode.channel.id;
            let dateNow = Date.now();
            if (!u.slowMode.hasOwnProperty(id) || (u.slowMode[id] + slowMode.timer) < dateNow) {
                u.slowMode[id] = dateNow;
            } else {
                await msg.author.send(makeTimestamp(dateNow - (u.slowMode[id] + slowMode.timer)) + " left on your slowmode clock.");
                await msg.delete();
            }
        } break;

        case count.channel?.id: {
            const content = String(wordsToNumbers(msg.content));
            const newNumber = count.current + 1;
            let msgNumber : number;
            try {           // if the message is just an equation, evaluate it.
                msgNumber = mathjs.evaluate(content);
            } catch (err) { // else check each character up until it isn't a number, and grab
                const numMatches = content.match(/\d+/g)?.map((x : string) => Number(x));
                msgNumber = numMatches?.find(x => x === newNumber);

                // if (!msgNumber) {
                //
                // }
                
                // if (isNaN(msgNumber)) return; // lets people talk between counting, might be unwanted behaviour
            }
            if ((count.current + 1) === msgNumber && count.lastCounter !== msg.author.id) {
                msg.react('✅')
                count.current++;
                count.lastCounter = msg.author.id;
            } else {
                // grabs the last two messages in the channel, and checks if they were made within 800 ms
                const messages = _.takeRight(msg.channel.messages.cache.toJSON(), 2);
                let reply;
                if (isNaN(msgNumber)) {
                    reply = `ermmm... that's not a number :/`
                } else if ((messages.length >= 2) && 800 < (messages[0].createdTimestamp - messages[1].createdTimestamp)) {
                    reply = `ooo... shoulda calmed down a bit!`
                } else if (count.lastCounter === msg.author.id) {
                    reply = `do you really think you can count twice in a row..?`
                } else {
                    reply = `heads up, ${newNumber} is actually ${count.current} + 1!! crazy.`
                }
                sendTo(msg, reply)
                
                msg.react('❌')
                count.current = 0;
                count.lastCounter = "";
            }
        } break;

        case chain.channel?.id: {
            let msgContent = msg.content;
            // if it's the same message and not a duplicate, or it's a new chain (a.k.a it's been repeated less than 3 times)
            if ((chain.current === msgContent.toLowerCase() && chain.lastChainer !== msg.author.id) || chain.chainLength < 3) {
                if (chain.chainLength >= 3) {
                    msg.react('⛓');
                }
                chain.current = msgContent.toLowerCase();
                chain.lastChainer = msg.author.id;
            } else {
                sendTo(msg, "is it really that hard to copy and paste the last message..???")
                msg.react('❌')
                chain.current = "";
                chain.lastChainer = "";
            }

        } break;

        case convo.convoChannel?.id: {
            console.log("huhhhh");
            await sendTo(convo.replyChannel, `${msg.author.displayName}[:](${msg.url})`);
        } break;

        case convo.replyChannel?.id: {
            await sendTo(convo.convoChannel, msg.content);
        } break;
            
        // default:
        //     break;
    }

    if (chain.autoChain > 0) {

    }
    // #endregion counting, chain, convo handler
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
    const notLimited : boolean = com.limitedTo[0] === null || com.limitedTo[0]?.includes(msg.author.id);
    const hasPerms : boolean = _.intersection(com.limitedTo[1], permissions).length > 0;

    debugLog(msg.author.username + " -- trusted : " + trusted + ", notLimited : " + notLimited + ", hasPerms : " + hasPerms);

    // if not limited to anybody, if limited to the message author/their permissions, or if user is fully trusted
    if (trusted || notLimited || hasPerms) {
        function convParam(content: string, paramType: any) : any {
            switch (paramType) {
                case "string" : return String(content); // just for safety :)
                case "number" : return Number(content);
                case "boolean": return content === "true";
                case "channel": return getChannel(content, msg.channel);
                default: console.error("Type " + paramType + " not supported! Did something go wrong or do you need to add another case?"); 
                    break;
            }
        }

        const dateNow = Date.now(); // actually really good for global time so that i don't need to persist it
        if (com.currentTimeout > dateNow) { // handle command timeout if needed, will send a message to tell the commander there's a timeout then delete once the command is ready, or in 5 seconds
            const timeToWait = com.currentTimeout - dateNow;
            const timeToWaitReply = timeToWait < 1000 ? timeToWait + " milliseconds" : mathjs.round(timeToWait / 1000) + " seconds";
            const timeoutReply = await sendTo(msg, "gotta wait " + timeToWaitReply + ". lol.");
            await sleep(mathjs.min(timeToWait, convertTime(5, Time.sec, Time.ms))); // hurrah for convertTime()
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
                for (let i = 1; i < quoteSplit.length; i += 2) { 
                    // check every other section (they will always be in double quotes) and check if it actually has spaces needed to be replaced
                    if (quoteSplit[i].indexOf(' ') > -1) {
                        quoteSplit[i] = quoteSplit[i].split(' ').join(space); // most reliable way to replace all spaces with the temporary space character
                    }
                }
                tempParameters = quoteSplit.join('').split(' '); // join everything back together then split it up as parameters
            } else {
                tempParameters = content.split(' ');
            }
            
            tempParameters.shift(); // remove the first element (the command) from the parameters

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
                        paramObj[param.name] = convParam(halves[1], param.type) ?? convParam(param.preset, param.type);
                    }
                } else {
                    const param = com.params[j];
                    paramObj[param.name] = convParam(tempParameters[i], param.type)
                    j++;
                }
                i++;
            }

            if (com.inf && (i < tempParameters.length)) {
                while (i < tempParameters.length) {
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
                paramObj[x.name] = typeof x.preset === x.type ? convParam(x.preset, x.type) : x.preset;
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
    const pages : string[][] = [[]];
    let page : number = 0;
    let pageLength : number = 0;
    for (let i = 0; i < response.length; i++) {
        pageLength += response[i].length;
        if (pageLength > 2000) {
            pageLength = 0;
            page++;
            pages[page] = [];
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
    "help" : new Command("bot/support", "lists all commands", async function (msg, p) {
        const before = performance.now();
        const reply = listCommands(commands, p["paramDescs"], p["whichCommand"]);
        debugLog(performance.now() - before)
        await sendTo(msg, reply);
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ]),

    // #region novelty
    "echo" : new Command("general/fun", "echoes whatever's in front of it", async function (msg, p) {
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

    "math" : new Command("general/fun", "does the math put in front of it", async function (msg, p) {
        try {
            await sendTo(msg, mathjs.evaluate(p["equation"]));
        } catch (error) {
            await sendTo(msg, error);
        }
    }, [
        new Param("equation", "the equation to be evaluated", "undefined"),
    ]),

    "mathClass" : new Command("general/fun", "this is for school lol", async function (msg, p) {
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

    "jerma" : new Command("general/fun", "Okay, if I... if I chop you up in a meat grinder, and the only thing that comes out, that's left of you, is your eyeball, you'r- you're PROBABLY DEAD!", async function (msg, p) {
        switch (p["fileType"]) {
            case 0: {
                const reaction = msg.react('✅');
                try {
                    if (!scpClient) scpClient = await scp.Client(remote_server);
                    await scpClient.list('/home/opc/mediaHosting/jermaSFX/').then(x => x.forEach((x: any) => debugLog(JSON.stringify(x))));
                    if (!jermaFiles) jermaFiles = await scpClient.list('/home/opc/mediaHosting/jermaSFX/');
                    const result = `./temp/${p["fileName"]}.mp3`;
                    const index = Math.round(Math.random() * jermaFiles.length - 1);
                    await scpClient.downloadFile(`/home/opc/mediaHosting/jermaSFX/${jermaFiles[index]["name"]}`, result);
                    await sendTo(msg.channel, "", true, [result]);
                    fs.unlinkSync(result);
                } catch (error) {
                    console.error(error);
                    await reaction;
                    await msg.reactions.removeAll().catch(error => console.error('Failed to remove reactions:\n', error));
                    await msg.react('❌');
                    if (os.hostname() === "macBOROS") {
                        await sendTo(msg, "sorry, jerma 0 only works on astrl's main pc. im being hosting from somewhere else rn")
                        return;
                    }
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

    "convertTime" : new Command("hidden", "converts time", async function(msg, p) {
        const newTime = convertTime(p["time"], p["typeFrom"], p["typeTo"]);
        await sendTo(msg, (`${p["time"]} ${p["typeFrom"]} is ${newTime} ${p["typeTo"]}`));
    }, [
        new Param("time", "", 0),
        new Param("typeFrom", "the time to convert from", "s"),
        new Param("typeTo",   "the time to convert to",   "s"),
    ]),
    // #endregion novelty

    // #region reactions
    "mock" : new Command("general/fun", "mocks text/whoever you reply to", async function (msg, p) {
        const reference = await (msg.reference !== null ? msg.fetchReference() : _.last(msg.channel.messages.cache.toJSON()));
        const toMock : string = reference.content;

        const mock = [];
        for (let i = 0; i < toMock.length; i++) {
            mock.push(i % 2 === 0 ? toMock[i].toLowerCase() : toMock[i].toUpperCase());
        }
        
        await sendTo(reference, mock.join(''));

        await msg.delete();
    }, [
        new Param("delete", "delete your message after sending it", true),
        new Param("message", "the message id to mock", ""),
    ]),

    "mockSelf" : new Command("general/fun", "mocks text/whoever you reply to", async function (msg, p) {
        const toMock : string = p["mock"];
        const mock = [];
        for (let i = 0; i < toMock.length; i++) {
            const vary = i % 2 === 0;
            mock[i] = (vary ? toMock[i].toLowerCase() : toMock[i].toUpperCase());
        }
        
        await sendTo(msg.channel, mock.join(''));

        if (p["delete"]) await msg.delete();
    }, [
        new Param("mock", "the text to mock", ""),
        new Param("delete", "delete your message after sending it", true)
    ]),

    "true" : new Command("general/fun", emojis.true, async function (msg, p) {
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

    "false" : new Command("hidden", "<:false:1123469352826576916>", async function (msg, p) {
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
    "countChannel" : new Command("patterns/counting", "sets the current channel to be the channel used for counting", async function (msg, p) {
        let channel : dc.TextChannel = p["channel"] ?? msg.channel;
        msg.react(channel ? '✅' : '❌');
        
        const count = _sGet(msg).count;
        const newCountChannel = count.channel !== null && channel.id === count.channel?.id;
        await sendTo(msg.channel, newCountChannel ? `counting in ${channel.name.toLowerCase()} has ceased.` : `alright, count in ${channel.name.toLowerCase()}!`);
        count.channel = newCountChannel ? null : channel;
    }, [
        new Param("channel", "the specific channel to start counting in", "", "channel")
    ], [[ "438296397452935169" ]]),

    "chainChannel" : new Command("patterns/chaining", "sets the current channel to be the channel used for message chains", async function (msg, p) {
        let channel = p["channel"] ?? msg.channel;
        msg.react(channel ? '✅' : '❌');
        
        const chain = _sGet(msg).count;
        const newChainChannel = chain.channel !== null && channel.id === chain.channel?.id;
        await sendTo(msg.channel, newChainChannel ? `counting in ${channel.name.toLowerCase()} has ceased.` : `alright, count in ${channel.name.toLowerCase()}!`);
        chain.channel = newChainChannel ? null : channel;
    }, [
        new Param("channel", "the specific channel to start counting in", "", "channel")
    ], [ [ "438296397452935169" ] ]),

    "autoChain" : new Command("patterns/chaining", "will let any channel start a chain", async function (msg, p) {
        _sGet(msg).chain.autoChain = p["howMany"];
        debugLog(_sGet(msg).chain.autoChain);
        await sendTo(msg, (`autoChain is now ${_sGet(msg).chain.autoChain}.`));
    }, [
        new Param("howMany", "how many messages in a row does it take for the chain to trigger?", 4)
    ], [ [ "438296397452935169" ] ]),
    // #endregion count/chain

    "slowMode" : new Command("server/channels", "artifically makes a slowmode, which means even admins can't get around it.", async function(msg, p) {
        const slowMode = _sGet(msg).slowMode;
        slowMode.channel = (p["channel"] ? msg.guild.channels.cache.get(p["channel"]) : msg.channel) as dc.TextChannel;
        slowMode.timer = convertTime(p["time"], findTime(p["timeType"]))
        debugLog(msg.author.username + " should be able to manage channels. if they can't then shut it down!!!")
        // await sendTo(msg, "wowza! you can manage channels. (no clue if this works so tell me if you can't. please)");
    }, [
        new Param("time", "the amount of time", ""),
        new Param("timeType", "the type of time", "s"),
        new Param("channel", "the channel ids affected", "")
    ], [ [], [ "ManageChannels" ] ]),

    "test" : new Command("hidden", "a bit queer init", async function (msg, p) {
        debugLog(p["params"]);
        sendTo(msg, p["params"].toString());
    }, [
        new Param("lol", "use this for anything", ""),
        new Param("params", "how new and innovative!", 0)
    ]),

    "cmd" : new Command("hidden", "astrl only!! internal commands that would be dangerous to let everybody use", async function (msg, p) {
        const cont = msg.content.substring(msg.content.indexOf(' ') + 1)
        debugLog("cont : " + cont);
        await parseCommand(msg, cont, cont.split(' ')[0], cmdCommands);
    }, [], [ [ "438296397452935169" ] ]),
}

// for more internal purposes; really just for astrl lol
const cmdCommands = {
    "help" : new Command("bot/support", "lists all cmd commands", async function (msg, p) {
        const reply = listCommands(cmdCommands, p["paramDescs"], p["whichCommand"]);
        await sendTo(msg, (reply));
    }, [
        new Param("paramDescs", "include parameter descriptions", false),
        new Param("whichCommand", "will return help for a specific command", ""),
    ]),

    "resetCount" : new Command("patterns/counting", "resets the current count", async function (msg, p) {
        // resetNumber(msg, 'reset the count!', '✅');
    }, []),

    "debug" : new Command("bot", "turns on/off debug mode (basically just sends more messages into the console)", async function (msg, p) {
        debugMode = !debugMode;
        await msg.react('✅');
    }),

    // keep this at the bottom, i just want easy access to it
    "invite" : new Command("bot", "make an invite using an id", async function (msg, p) {
        await (client.guilds.cache.get(p["id"]).channels.cache.filter(x => x.isTextBased()).first() as dc.TextChannel)
            .createInvite({ maxAge: 0, maxUses: 0 })
            .then(async (invite) => {
                sendTo(msg, invite.url);
            })
    }, [
        new Param("id", ":)", ""),
    ]),

    // #region messaging
    "send" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (msg, p) {
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

    "convo" : new Command("bot", "sends a message from The Caretaker into a specific guild/channel", async function (msg, p) {
        try {
            console.log(p["guild"]);
            const guild : dc.Guild = await client.guilds.fetch(p["guild"]);
            if (guild !== undefined) {
                const channel = await guild.channels.fetch(p["channel"]);
                const s = _sGet(msg);
                s.convo.convoChannel = channel as dc.TextChannel;
                s.convo.replyChannel = msg.channel as dc.TextChannel;
                await sendTo(msg, s.convo.convoChannel.id);
            }
        } catch (error) {
            await sendTo(msg, "dumbass\n"+error)
        }
    }, [
        new Param("channel", "the channel id to send the message into", "1113944754460315759"), // cc bot commands channel id
        new Param("guild", "the channel id to send the message into", "1113913617608355992"), // cc guild id
    ]),
    // #endregion messaging

    "restart" : new Command("bot", "restarts the bot", async function (msg, p) {
        await sendTo(msg.channel, 'bot is restarting');
        await save();
        await client.destroy();
    }),

    "kill" : new Command("bot", "kills the bot", async function (msg, p) {
        await sendTo(msg.channel, 'bot is now dead 😢');
        await kill();
    }),

    // #region code stuff
    "save" : new Command("bot", "saves the bot's data", async (m, p) => await save()),
    "load" : new Command("bot", "loads the bot's data", async (m, p) => await load()),

    "eval" : new Command("general/fun", "runs javascript code from a string", async function (msg1, p) {
        const cont = msg1.content;
        let reaction : Promise<dc.MessageReaction>;
        try {
            reaction = msg1.react('✅');
            const code = cont.substring(cont.indexOf(' ', cont.indexOf(' ') + 1) + 1);
            const msg = msg1; // the only way to get the message in eval (why?? idk. it was working before)
            const codeReturn = await eval(code);
            console.info(codeReturn);
        } catch (error) {
            await reaction.then(async reaction => {
                await reaction.remove();
                await msg1.react('❌');
                await sendTo(msg1, (error));
            })
        }
    }),

    "evalReturn" : new Command("general/fun", "runs javascript code from a string", async function (msg1, p) {
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

    "didAnythingBreak?" : new Command("hidden", "just testing every command until something breaks", async function (msg, p) {
        // this is silly and doesn't really work lol
        const keys = Object.keys(commands);
        for (let i = 0; i < keys.length; i++) {
            await sendTo(msg, ("testing command " + keys[i]))
            await sleep(1, Time.sec);
            await parseCommand(msg, (config.prefix + keys[i]), keys[i], commands);
            await sleep(1, Time.sec);
        }

        await sendTo(msg, "finished!");
    }),

    "sanityCheck" : new Command("hidden", "do several checks on all the commands to make sure they're up to snuff", async function(msg, p) {
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
    "test" : new Command("bot", "various things astrl will put in here to test node.js/discord.js", async function (msg, p) {
        msg.send("blehh")
    }, [
        new Param("lol", "use this for anything", ""),
        new Param("params", "how new and innovative!", 0)
    ]),
}
// Log in to Discord with your client's token
client.login(config.token);