import re

def parse_content(content):
    sections = content.split('========================================================')
    for i, section in enumerate(sections):
        if 'SLIDE' not in section: continue
        print(f"DEBUG: Section {i} repr: {repr(section[:100])}")
        title = re.search(r'Slide Title:\s*(.*)', section)
        if title:
            print(f"DEBUG: Found title: {repr(title.group(1))}")
        else:
            print(f"DEBUG: Title NOT found")

with open('content.txt', 'r') as f:
    content = f.read()
parse_content(content)
