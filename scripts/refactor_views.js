const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceInDir(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('FROM opportunities')) {
                content = content.replace(/FROM opportunities/g, 'FROM opportunity_current_state');
                content = content.replace(/UPDATE opportunities/g, 'UPDATE opportunity_current_state'); 
                // wait we already replaced UPDATE opportunities SET status with transitionOpportunity. 
                // Any other UPDATE opportunities shouldn't hit the view for writing unless it's supported. 
                // Actually UPDATE plan can just mutate the base table: UPDATE opportunities SET plan. 
                // Let's just do FROM.
                content = content.replace(/UPDATE opportunity_current_state/g, 'UPDATE opportunities');
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Updated', fullPath);
            }
        }
    }
}

replaceInDir(path.join(__dirname, '..', 'kernel'));
replaceInDir(path.join(__dirname, '..', 'sense'));
console.log('Done.');
