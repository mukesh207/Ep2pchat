import re

with open('/home/st4rk/Public/Ep2pchat/docs/reports/Trustline_Report.md', 'r') as f:
    content = f.read()

# Update ACKNOWLEDGEMENT section
old_ack = r'## ACKNOWLEDGEMENT\nThe completion of this research project.*?advanced communication security\.'
new_ack = r'''## ACKNOWLEDGEMENT
First, I wish to thank the Almighty, who gave me good health and success throughout my project work.

I wish to express my heartfelt thanks to our Honorable Founder, Dr. S. Jagathrakshakan, and Dr. J. Sundeep Aanand, President, for providing me with the necessary facilities to complete my project.

I dedicate my thanks to esteemed Dr. M. Sundararajan, Vice-Chancellor In-charge, for his support and encouragement.

I express my sincere gratitude to Dr. A. Muthukumaravel, Dean PG, Faculty of Arts and Science, Dr. S. Arumugam, Dean UG, Faculty of Arts and Science, and Dr. S. Silvia Priscila, Associate Professor and Head, Department of Computer Science, Faculty of Arts and Science, for their support during the project to make it successful.

I dedicate my thanks to my beloved Guide ____________, Department of Computer Science, Faculty of Arts and Science, for his/her support and valuable guidance throughout the project work.

I offer my cordial thanks to my parents, friends, staff members, and well-wishers for their continued encouragement throughout my career. I also thank people who have directly or indirectly given me encouragement and support throughout the project.

XXX (Reg No)  
YYY (Reg No)  
ZZZ (Reg No)'''

content = re.sub(old_ack, new_ack, content, flags=re.DOTALL)

# Update TABLE OF CONTENTS section
old_toc = r'## TABLE OF CONTENTS\n\n\| S\.NO \| DESCRIPTION \| PAGE NO \|\n\| :--- \| :--- \| :--- \|\n.*?\| 10\.2 \| Output Screen Shots \| 45 \|'
new_toc = r'''## TABLE OF CONTENTS

| S.NO. | DESCRIPTION | PAGE NO. |
| :--- | :--- | :--- |
| | Abstract | vi |
| | Table of Contents | vii |
| | List of Figures | ix |
| 1. | INTRODUCTION | 1 |
| 1.1 | An Overview | 1 |
| 1.2 | Objective & Scope of the Project | 1 |
| 1.3 | Literature Survey | 1 |
| 1.4 | Problem Statement | 1 |
| 2. | SYSTEM ANALYSIS | 8 |
| 2.1 | Existing system | 8 |
| 2.2 | Disadvantages of Existing system | 8 |
| 2.3 | Proposed system | 8 |
| 2.4 | Advantages of Proposed System | 8 |
| 3. | SYSTEM CONFIGURATION | 12 |
| 3.1 | Hardware Requirements | 12 |
| 3.2 | Software Requirements | 12 |
| 4. | SYSTEM DESIGN | 15 |
| 4.1 | Overall Architecture diagram | 15 |
| 4.2 | Methodology / Algorithm Adopted | 15 |
| 5. | SYSTEM IMPLEMENTATION | 22 |
| 5.1 | Module Description | 22 |
| 6. | SYSTEM TESTING | 28 |
| 6.1 | Unit Testing | 28 |
| 6.2 | Integrated Testing | 28 |
| 6.3 | Black Box Testing | 28 |
| 6.4 | White Box Testing | 28 |
| 6.5 | Verification Testing | 28 |
| 6.6 | Validation Testing | 28 |
| 6.7 | User Acceptance Testing | 28 |
| 7. | Results and Discussion | 35 |
| 8. | CONCLUSION | 40 |
| 9. | LIMITATIONS & SCOPE OF FUTURE WORK | 42 |
| 10. | REFERENCES | 44 |
| 11. | APPENDIX | 45 |
| 11.1 | Source Code | 45 |
| 11.2 | Output Screen Shots | 45 |

## LIST OF FIGURES

| FIGURE NO. | DESCRIPTION |
| :--- | :--- |
| Figure 1 | Overall Architecture Diagram |
| Figure 2 | Zero-Knowledge "Blind Router" Logic |
| Figure 3 | X3DH Key Agreement |
| Figure 4 | The Double Ratchet Protocol |
| Figure 5 | PostgreSQL Row-Level Security (RLS) |
| Figure 6 | WebAuthn Passwordless Authentication |
| Figure 7 | CRDT Synchronization Flow |
| Figure 8 | Identity Verification Screen |
| Figure 9 | Encrypted Message Vault |
| Figure 10 | Administrator Device Portal |
| Figure 11 | Relay Node Monitor |
| Figure 12 | Admin Console - Pending Approvals |
| Figure 13 | Admin Console - Policies |'''

content = re.sub(old_toc, new_toc, content, flags=re.DOTALL)

# Fix heading numbering
content = content.replace('## 10. APPENDIX', '## 11. APPENDIX')
content = content.replace('### 10.1 Source Code', '### 11.1 Source Code')
content = content.replace('### 10.2 Output Screen Shots', '### 11.2 Output Screen Shots')
content = content.replace('## References', '## 10. REFERENCES')

with open('/home/st4rk/Public/Ep2pchat/docs/reports/Trustline_Report.md', 'w') as f:
    f.write(content)
