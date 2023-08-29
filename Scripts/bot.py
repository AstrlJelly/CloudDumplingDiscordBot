# bot.py
import os

import discord
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv('MTE0MzY1MDE2Nzk2MzI3MTMyOQ.GV3u67.nCJnUVcyh7mPd-OO8Xkt-xjIQc8lUbUUKyKVgU')

client = discord.Client()

@client.event
async def on_ready():
    print(f'{client.user} has connected to Discord!')

client.run(TOKEN)