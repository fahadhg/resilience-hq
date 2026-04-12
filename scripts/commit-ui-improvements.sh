#!/bin/bash
cd /vercel/share/v0-project

# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "refactor: Comprehensive UI improvements aligned with NGen branding

- Updated color system to use NGen orange (#F15A22) as primary accent
- Migrated typography from DM Sans to Inter for cleaner, more professional look
- Improved navigation bar: increased height, added RGen logo mark with shadow, better visual weight
- Fixed tool grid: changed from cramped 8-column to readable 4-column layout
- Replaced all emojis with Lucide icons (BarChart3, Bot, Factory, Users, etc)
- Standardized card padding to p-4 with consistent gap-4 grid spacing
- Added zebra striping (alternating row backgrounds) to all data tables for better scanability
- Improved footer with data source cards, disclaimer box, and proper NGen branding
- Moved all keyframe animations to globals.css and removed inline styles
- Standardized status indicators with unified live-dot class and pulse animation
- Enhanced Intel Modules section with better tab styling, icon integration, and visual hierarchy
- Added tab scroll indicator with fade gradient for better UX
- Improved component hierarchy throughout with better typography scales and spacing"

# Push to main branch
git push origin main
