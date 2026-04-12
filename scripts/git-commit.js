import { execSync } from 'child_process';
import path from 'path';

const projectDir = '/vercel/share/v0-project';

try {
  process.chdir(projectDir);
  
  console.log('[v0] Checking git status...');
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  console.log('[v0] Modified files:', status);
  
  console.log('[v0] Adding all changes...');
  execSync('git add .', { encoding: 'utf-8' });
  
  console.log('[v0] Committing changes...');
  const commitMessage = `feat: UI improvements aligned with NGen branding

- Updated color scheme with NGen orange (#F15A22) as primary brand color
- Switched from DM Sans to Inter font for cleaner, more professional typography
- Improved Navigation bar with larger height, better logo treatment, and live data badge
- Fixed tool grid layout from 8-column to 4-column with proper spacing
- Replaced all emojis with professional Lucide icons throughout the app
- Standardized card padding to p-4 for consistency across components
- Added zebra striping to tables for improved scannability
- Added tab scroll fade indicator for better UX on overflow tabs
- Enhanced footer with data source cards and improved disclaimer
- Moved all keyframe animations from inline styles to globals.css
- Standardized status indicator dots with pulse animation
- Improved Intel Modules section with better tab styling and component hierarchy
- Consolidated spacing and improved visual hierarchy throughout`;
  
  execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' });
  console.log('[v0] ✓ Changes committed successfully to main branch');
  
} catch (error) {
  console.error('[v0] Error during commit:', error.message);
  process.exit(1);
}
