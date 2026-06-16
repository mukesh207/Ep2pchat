import os
import glob

def update_rels(rels_file):
    with open(rels_file, 'r') as f:
        content = f.read()
    
    # Replace targets
    new_content = content.replace('Target="../media/image2.jpeg"', 'Target="../media/logo.png"')
    new_content = new_content.replace('Target="../media/image3.png"', 'Target="../media/logo.png"')
    new_content = new_content.replace('Target="../media/image5.jpeg"', 'Target="../media/logo.png"')
    
    if new_content != content:
        with open(rels_file, 'w') as f:
            f.write(new_content)
        print(f"Updated {rels_file}")

# Find all .rels files
rels_files = glob.glob('unpacked/**/*.rels', recursive=True)
for rf in rels_files:
    update_rels(rf)
