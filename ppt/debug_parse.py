import re

def parse_content(content):
    slides_data = {}
    # Use regex to find SLIDE X and everything until the next SLIDE Y
    # But it's easier to just split by SLIDE and then parse.
    parts = re.split(r'SLIDE (\d+)', content)
    # parts[0] is everything before SLIDE 1
    # parts[1] is "1"
    # parts[2] is the content of slide 1
    # parts[3] is "2"
    # parts[4] is the content of slide 2
    
    for i in range(1, len(parts), 2):
        slide_num = int(parts[i])
        slide_content = parts[i+1]
        
        data = {
            'title': '',
            'content': '',
            'bullets': [],
            'table': [],
            'metrics': []
        }
        
        lines = slide_content.split('\n')
        current_section = None
        for line in lines:
            line = line.strip()
            if not line: continue
            
            if 'Slide Title:' in line:
                data['title'] = line.split('Slide Title:', 1)[1].strip()
            elif 'Main Content:' in line:
                data['content'] = line.split('Main Content:', 1)[1].strip()
            elif 'Bullet Points:' in line:
                current_section = 'bullets'
                data['bullets'] = []
            elif 'Tables:' in line:
                current_section = 'table'
                data['table'] = []
            elif 'Metrics:' in line:
                current_section = 'metrics'
                data['metrics'] = []
            elif 'Technical Notes:' in line or 'Diagram Explanation:' in line:
                current_section = None
            elif line.startswith('- ') or line.startswith('* '):
                if current_section == 'bullets':
                    data['bullets'].append(line[2:].strip())
                elif current_section == 'metrics':
                    data['metrics'].append(line[2:].strip())
            elif line.startswith('|') and current_section == 'table':
                if '---' not in line:
                    row = [cell.strip() for cell in line.split('|')[1:-1]]
                    data['table'].append(row)
        
        slides_data[slide_num] = data
    return slides_data

with open('content.txt', 'r') as f:
    content = f.read()
data = parse_content(content)
print(f"Slide 2 Title: '{data[2]['title']}'")
print(f"Slide 2 Bullets: {len(data[2]['bullets'])}")
