"""Application composition root and Telegram polling entry point."""

from __future__ import annotations

from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters
from telegram.request import HTTPXRequest

from dailylogbot.config import load_config
from dailylogbot.db import Database
from dailylogbot.handlers import BotHandlers
from dailylogbot.logging_config import configure_logging


def main() -> None:
    """Configure and run the private DailyLog polling application.

    Side Effects:
        Initializes storage, opens Telegram HTTP resources, and blocks while
        polling until the process receives a supported shutdown signal.
    """
    config = load_config()
    configure_logging(config.log_level)
    repository = Database(config.database_path)
    bot_handlers = BotHandlers(config, repository)
    request = HTTPXRequest(
        connection_pool_size=config.telegram_connection_pool_size,
        connect_timeout=config.telegram_network_timeout_seconds,
        read_timeout=config.telegram_network_timeout_seconds,
        write_timeout=config.telegram_network_timeout_seconds,
        pool_timeout=config.telegram_network_timeout_seconds,
    )
    application = (
        ApplicationBuilder()
        .token(config.bot_token)
        .request(request)
        .get_updates_request(request)
        .concurrent_updates(1)
        .build()
    )
    application.add_handler(CommandHandler("start", bot_handlers.start))
    application.add_handler(CommandHandler("help", bot_handlers.help))
    application.add_handler(CommandHandler("today", bot_handlers.today))
    application.add_handler(CommandHandler("last", bot_handlers.last))
    application.add_handler(CommandHandler("delete_last", bot_handlers.delete_last))
    application.add_handler(CommandHandler("delete", bot_handlers.delete_command))
    application.add_handler(CommandHandler("delete_day", bot_handlers.delete_day_command))
    application.add_handler(CommandHandler("export", bot_handlers.export_command))
    application.add_handler(CommandHandler("edit", bot_handlers.edit_command))
    application.add_handler(CommandHandler("edit_last", bot_handlers.edit_last_command))
    application.add_handler(CommandHandler("weighin", bot_handlers.weighin))
    application.add_handler(CommandHandler("add_past", bot_handlers.add_past))
    application.add_handler(CommandHandler("quick_edit", bot_handlers.quick_edit))
    application.add_handler(CommandHandler("manage", bot_handlers.manage))
    application.add_handler(CommandHandler("settings", bot_handlers.settings))
    application.add_handler(CommandHandler("cancel", bot_handlers.cancel))
    application.add_handler(CommandHandler("end", bot_handlers.end_activity))
    application.add_handler(CommandHandler("stop", bot_handlers.end_activity))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, bot_handlers.message))
    application.add_error_handler(bot_handlers.error)
    application.run_polling(drop_pending_updates=False)
