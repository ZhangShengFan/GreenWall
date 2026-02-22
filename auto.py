import os, json, subprocess
from datetime import datetime, timedelta
import random as _random

actor = os.environ.get('GIT_AUTHOR_NAME', 'github-actions')
email = os.environ.get('GIT_AUTHOR_EMAIL', 'github-actions@github.com')
subprocess.run(['git', 'config', 'user.name',  actor], check=True)
subprocess.run(['git', 'config', 'user.email', email], check=True)

MODE          = os.environ.get('MODE', 'pixel')
INTENSITY_CAP = int(os.environ.get('INTENSITY_CAP', '4'))
SKIP_WEEKENDS = os.environ.get('SKIP_WEEKENDS', 'false').lower() == 'true'
START         = os.environ.get('START', '').strip()
END           = os.environ.get('END', '').strip()
BASE_SUNDAY   = os.environ.get('BASE_SUNDAY', '').strip()
RANDOM_MAX    = int(os.environ.get('RANDOM_MAX', '4'))
GRID_JSON     = os.environ.get('GRID_JSON', '').strip()
LOG_FILE      = 'log.txt'

def is_valid_date(s):
    try:
        datetime.strptime(s, '%Y-%m-%d')
        return True
    except Exception:
        return False

def parse_date(s):
    return datetime.strptime(s.strip(), '%Y-%m-%d')

def default_base_sunday():
    jan1 = datetime(datetime.now().year, 1, 1)
    offset = jan1.weekday() + 1
    if jan1.weekday() == 6:
        offset = 0
    return jan1 - timedelta(days=offset)

def commit(dt: datetime, msg: str):
    iso = dt.strftime('%Y-%m-%dT%H:%M:%S')
    with open(LOG_FILE, 'a') as f:
        f.write(f'{iso} | {msg}\n')
    subprocess.run(['git', 'add', LOG_FILE], check=True)
    env = os.environ.copy()
    env['GIT_AUTHOR_DATE']    = iso
    env['GIT_COMMITTER_DATE'] = iso
    subprocess.run(['git', 'commit', '-m', msg], env=env, check=True)

def date_range(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)

if MODE == 'pixel':
    grid = json.loads(GRID_JSON) if GRID_JSON else []
    base = parse_date(BASE_SUNDAY) if is_valid_date(BASE_SUNDAY) else default_base_sunday()
    for x, col in enumerate(grid):
        for y, lvl in enumerate(col):
            if lvl <= 0:
                continue
            count = min(int(lvl), INTENSITY_CAP)
            day = base + timedelta(weeks=x, days=y)
            for i in range(count):
                t = day.replace(hour=10) + timedelta(minutes=11 * i)
                commit(t, f'pixel: {day.date()} x{x}y{y} lvl{lvl} #{i+1}')

elif MODE == 'today':
    today = datetime.now().replace(hour=10, minute=0, second=0)
    for i in range(INTENSITY_CAP):
        commit(today + timedelta(minutes=11 * i), f'today: #{i+1}')

elif MODE == 'range':
    if not is_valid_date(START) or not is_valid_date(END):
        raise ValueError(f'range 模式需要有效的 START 和 END，当前值: START={START!r} END={END!r}')
    for day in date_range(parse_date(START), parse_date(END)):
        if SKIP_WEEKENDS and day.weekday() >= 5:
            continue
        for i in range(INTENSITY_CAP):
            t = day.replace(hour=10) + timedelta(minutes=11 * i)
            commit(t, f'range: {day.date()} #{i+1}')

elif MODE == 'random':
    if not is_valid_date(START) or not is_valid_date(END):
        raise ValueError(f'random 模式需要有效的 START 和 END，当前值: START={START!r} END={END!r}')
    for day in date_range(parse_date(START), parse_date(END)):
        if SKIP_WEEKENDS and day.weekday() >= 5:
            continue
        count = _random.randint(0, RANDOM_MAX)
        for i in range(count):
            t = day.replace(hour=10) + timedelta(minutes=11 * i)
            commit(t, f'random: {day.date()} #{i+1}')
