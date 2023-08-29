# This example requires the 'message_content' intent.

import discord

intents = discord.Intents.default()
intents.message_content = True

client = discord.Client(intents=intents)

currentNumber = 0
lastHighest = 0

@client.event
async def on_ready():
    print(f'We have logged in as {client.user}')

@client.event
async def on_message(message):
    global currentNumber
    global lastHighest

    if message.author == client.user: return
    if message.author.id == 438296397452935169 and message.content.startswith("&false alarm"):
        currentNumber = lastHighest
        await message.channel.send(f'oops. i messed up. the number has been reset to {currentNumber}')

    if message.content[0].isalnum() == False: return

    i = 0
    for char in message.content:
        i += 1
        if char.isalnum() == False:
            break
    
    if message.content[:i] == (currentNumber + 1):
        numInput = int(message.content[:i])
        print(numInput)
        add_current()

        await message.channel.send(f'the number is now {currentNumber}')
    else:
        lastHighest = currentNumber
        currentNumber = 0
        await message.channel.send(f'damnnnn... you guys fucked up. you got all the way to {lastHighest}')

def add_current():
    global currentNumber
    currentNumber += 1

client.run('MTE0MzY1MDE2Nzk2MzI3MTMyOQ.GV3u67.nCJnUVcyh7mPd-OO8Xkt-xjIQc8lUbUUKyKVgU')
