import os
import glob

files = glob.glob('app/routers/*.py')
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    content = content.replace('require_role("admin")', 'require_role("admin", "authorizor")')
    content = content.replace("require_role('admin')", "require_role('admin', 'authorizor')")
    content = content.replace('require_role("admin", "manager")', 'require_role("admin", "manager", "authorizor")')
    content = content.replace("require_role('admin', 'manager')", "require_role('admin', 'manager', 'authorizor')")
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
