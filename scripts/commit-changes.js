import { execSync } from 'child_process';

try {
  console.log('Adding all changes...');
  execSync('git add -A', { cwd: '/vercel/share/v0-project', stdio: 'inherit' });

  console.log('Committing changes...');
  execSync('git commit -m "refactor: improve UI/UX with NGen branding, typography, and component updates\n\n- Updated color scheme to NGen orange (#F15A22) with improved CSS variables\n- Migrated typography from DM Sans to Inter for better readability\n- Enhanced Nav bar with better height, logo prominence, and visual hierarchy\n- Fixed tool grid from 8-col to 4-col responsive layout\n- Replaced all emojis with Lucide icons (BarChart3, Bot, Factory, Users, etc.)\n- Standardized card padding to p-4 with consistent gap-4 spacing\n- Added zebra striping to tables via CSS classes for better scannability\n- Added tab scroll indicators with fade gradient on overflow\n- Improved footer with data source cards and disclaimer section\n- Moved all keyframe animations to globals.css from inline styles\n- Created standardized live-dot status indicator component\n- Enhanced Intel Modules with better tab styling and icon integration\n- Added scrollbar-hide utility for cleaner scrollable containers"', { cwd: '/vercel/share/v0-project', stdio: 'inherit' });

  console.log('✓ Changes committed successfully to main branch');
} catch (error) {
  console.error('Error during commit:', error.message);
  process.exit(1);
}
