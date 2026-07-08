from __future__ import annotations

import logging

from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters

from dailylogbot.config import load_config
from dailylogbot.db import Database
from dailylogbot.handlers import BotHandlers


def main() -> None:
    config = load_config()
    logging.basicConfig(
        level=getattr(logging, config.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    db = Database(config.database_path)
    handlers = BotHandlers(config, db)

    application = ApplicationBuilder().token(config.bot_token).build()
    application.add_handler(CommandHandler("start", handlers.start))
    application.add_handler(CommandHandler("help", handlers.help))
    application.add_handler(CommandHandler("today", handlers.today))
    application.add_handler(CommandHandler("last", handlers.last))
    application.add_handler(CommandHandler("delete_last", handlers.delete_last))
    application.add_handler(CommandHandler("delete", handlers.delete_command))
    application.add_handler(CommandHandler("export", handlers.export_command))
    application.add_handler(CommandHandler("edit", handlers.edit_command))
    application.add_handler(CommandHandler("edit_last", handlers.edit_last_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handlers.message))
    application.add_error_handler(handlers.error)
    application.run_polling()
