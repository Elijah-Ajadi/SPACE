#!/bin/bash
echo "Building project..."
python3 -m pip install -r requirements.txt
python3 manage.py collectstatic --noinput --clear
python3 manage.py migrate --noinput
echo "Build finished."
