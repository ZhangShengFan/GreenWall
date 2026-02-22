import os, json, subprocess
from datetime import datetime, timedelta
import random as _random

MODE          = os.environ.get('MODE', 'pixel')
INTENSITY_CAP = int(os.environ.get('INTENSITY_CAP', '4'))
SKIP_WEEKENDS = os.environ.get('SKIP_WEEKENDS', 'false').lower() == 'true'
START         = os.environ.get('START', '')
END           = os.environ.get('END', '')
BASE_SUNDAY   = os.environ.get('BASE_SUNDAY', '')
RANDOM_MAX    = int(os.environ.get('RANDOM_MAX', '4'))
GRID_JSON     = os.environ.get('GRID_JSON', '')
LOG_FILE      = 'log.txt'

def commit(dt: datetime, msg: str):
    iso = dt.strftime('%Y-%m-%dT%H:%M:%S')
    with open(LOG_FILE, 'a') as f:
        f.write(f'{iso} | {msg}\n')
    subprocess.run(['git', 'add', LOG_FILE], check=True)
    env = os.environ.copy()
    env['GIT_AUTHOR_DATE']    = iso
    env['GIT_COMMITTER_DATE'] = iso
    subprocess.run(['git', 'commit', '-m', msg], env=env, check=True)

def parse_date(s):
    return datetime.strptime(s.strip(), '%Y-%m-%d')

def date_range(start, end):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)

if MODE == 'pixel':
    grid = json.loads(GRID_JSON) if GRID_JSON else []
    base = parse_date(BASE_SUNDAY) if BASE_SUNDAY else datetime.now().replace(month=1, day=1)
    base -= timedelta(days=base.weekday() + 1) if base.weekday() != 6 else timedelta()
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
    if not START or not END:
        raise ValueError('range 模式需要 START 和 END')
    for day in date_range(parse_date(START), parse_date(END)):
        if SKIP_WEEKENDS and day.weekday() >= 5:
            continue
        for i in range(INTENSITY_CAP):
            t = day.replace(hour=10) + timedelta(minutes=11 * i)
            commit(t, f'range: {day.date()} #{i+1}')

elif MODE == 'random':
    if not START or not END:
        raise ValueError('random 模式需要 START 和 END')
    for day in date_range(parse_date(START), parse_date(END)):
        if SKIP_WEEKENDS and day.weekday() >= 5:
            continue
        count = _random.randint(0, RANDOM_MAX)
        for i in range(count):
            t = day.replace(hour=10) + timedelta(minutes=11 * i)
            commit(t, f'random: {day.date()} #{i+1}')
