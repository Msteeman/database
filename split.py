
import re

with open('index.html', 'r') as f:
    index_content = f.read()

# Extract CSS
style_blocks = re.findall(r'<style.*?>(.*?)</style>', index_content, re.DOTALL)
css_content = "\n".join(style_blocks)
with open('style.css', 'w') as f:
    f.write(css_content)

# Extract JS
js_module_match = re.search(r'<script type="module">(.*?)</script>', index_content, re.DOTALL)
if js_module_match:
    js_content = js_module_match.group(1)
    with open('app.js', 'w') as f:
        f.write(js_content)

# Create new index.html
new_index_content = re.sub(r'<style.*?>.*?</style>', '', index_content, flags=re.DOTALL)
if js_module_match:
    new_index_content = re.sub(r'<script type="module">.*?</script>', '<script type="module" src="app.js"></script>', new_index_content, flags=re.DOTALL)

# Add CSS link
new_index_content = new_index_content.replace('</head>', '  <link rel="stylesheet" href="style.css">\n</head>')

with open('index.html', 'w') as f:
    f.write(new_index_content)

print("Splitting index.html completed successfully.")
