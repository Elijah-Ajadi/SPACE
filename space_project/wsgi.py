"""
WSGI config for space_project project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "space_project.settings")

application = get_wsgi_application()

# Auto-migrate database tables on startup (e.g. for Neon DB PostgreSQL first connection)
try:
    from django.core.management import call_command
    call_command("migrate", interactive=False)
except Exception as err:
    print(f"[WSGI] Auto-migration status: {err}")

app = application

