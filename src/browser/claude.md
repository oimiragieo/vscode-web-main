# src/browser/ - Frontend Assets & UI Components

## Overview

This directory contains all browser-side assets served to clients, including HTML pages, CSS stylesheets, media files, and service worker code. These files define the user interface for non-VSCode pages (login, error pages) and static assets.

## Directory Structure

```
src/browser/
├── pages/              # HTML pages and stylesheets
├── media/              # Images, icons, favicons
├── serviceWorker.ts    # PWA service worker
├── robots.txt          # Search engine directives
└── security.txt        # Security disclosure info
```

---

## Files

### serviceWorker.ts
**Purpose:** Progressive Web App (PWA) service worker implementation

**Functionality:**
- Enables offline functionality
- Caches static assets
- Handles background sync
- Manages push notifications (if configured)
- Improves load performance through caching

**Key Features:**
- Cache-first strategy for static assets
- Network-first for API calls
- Automatic cache invalidation
- Background sync for offline operations

**Extension Point:** Extend to add custom caching strategies or offline capabilities

---

### robots.txt
**Purpose:** Search engine crawler directives

**Content:**
- Disallow rules for sensitive paths
- Sitemap location (if applicable)
- Crawl delay settings

**Security:** Prevents search engines from indexing the IDE interface

---

### security.txt
**Purpose:** Security disclosure and vulnerability reporting information

**Content:**
- Contact information for security issues
- PGP key for encrypted communications
- Preferred languages
- Canonical URL

**Standard:** Follows [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html)

---

## pages/ Subdirectory

### login.html
**Purpose:** Legacy login page (original design)

**Features:**
- Simple, functional login form
- Password input field
- CSRF token support
- Error message display
- Redirect on successful authentication

**Template Variables:**
- `{{BASE}}` - Base path for assets
- `{{CS_STATIC_BASE}}` - Static asset base path
- `{{ERROR}}` - Error message to display
- `{{I18N_*}}` - Internationalization strings

**Note:** Being replaced by modern-login.html for better UX

---

### login.css
**Purpose:** Stylesheet for legacy login page

**Styling:**
- Basic form styling
- Responsive layout
- Error message styling
- Button states

---

### modern-login.html
**Purpose:** Modern redesigned login page with enhanced UX

**Features:**
- Card-based design
- Animated gradient background
- Password visibility toggle
- Inline error display
- Loading states
- ARIA labels for accessibility
- Responsive design
- Modern UI/UX patterns

**Accessibility:**
- WCAG 2.1 AA compliant
- Keyboard navigation support
- Screen reader friendly
- Focus management
- Semantic HTML5

**Template Variables:**
- `{{BASE}}` - Base path
- `{{CS_STATIC_BASE}}` - Static assets
- `{{ERROR}}` - Error message
- `{{I18N_TITLE}}` - Page title
- `{{I18N_USERNAME}}` - Username label
- `{{I18N_PASSWORD}}` - Password label
- `{{I18N_LOGIN}}` - Login button text
- `{{I18N_ERROR}}` - Error message prefix

**Extension Point:** Customize login page branding, add OAuth buttons, SSO integration

---

### modern-login.css
**Purpose:** Stylesheet for modern login page

**Features:**
- CSS Grid/Flexbox layout
- Animated gradients
- Smooth transitions
- Responsive breakpoints
- Dark mode support via CSS variables
- Focus states
- Loading animations

**Design System Integration:** Uses variables from design-system.css

---

### design-system.css
**Purpose:** Central design system with CSS custom properties

**Variables Defined:**
- **Colors:** Primary, secondary, neutral palettes
- **Typography:** Font families, sizes, weights, line heights
- **Spacing:** Consistent spacing scale (4px grid)
- **Borders:** Radius values
- **Shadows:** Elevation system
- **Transitions:** Duration and easing functions
- **Z-index:** Layering scale

**Benefits:**
- Consistent styling across pages
- Easy theme customization
- Dark mode support
- Maintainable color system

**Extension Point:** Customize brand colors, typography, spacing for white-label solutions

---

### global.css
**Purpose:** Global styles applied to all pages

**Includes:**
- CSS reset/normalization
- Base typography
- Utility classes
- Common component styles
- Print styles
- Accessibility helpers

**Scope:** Loaded on all non-VSCode pages

---

### error.html
**Purpose:** Error page template for HTTP errors

**Use Cases:**
- 404 Not Found
- 500 Internal Server Error
- 403 Forbidden
- 401 Unauthorized
- Custom error messages

**Features:**
- Error code display
- Error message
- Navigation back to home
- Responsive design
- Consistent branding

**Template Variables:**
- `{{BASE}}` - Base path
- `{{CS_STATIC_BASE}}` - Static assets
- `{{ERROR_CODE}}` - HTTP status code
- `{{ERROR_MESSAGE}}` - Error description
- `{{DETAILS}}` - Additional error details

---

### error.css
**Purpose:** Stylesheet for error pages

**Styling:**
- Centered error message
- Large error code display
- Helpful messaging
- Action buttons
- Responsive layout

---

## media/ Subdirectory

### Favicons

#### favicon.ico
**Purpose:** Legacy favicon format for older browsers

**Specs:**
- ICO format
- Multiple sizes embedded (16x16, 32x32, 48x48)
- Fallback for non-SVG browsers

#### favicon.svg
**Purpose:** Modern SVG favicon

**Benefits:**
- Scalable vector graphics
- Smaller file size
- Sharp at any size
- Easy to customize

#### favicon-dark-support.svg
**Purpose:** SVG favicon with dark mode support

**Features:**
- Adapts to system theme
- Different colors for light/dark modes
- Uses `prefers-color-scheme` media query
- Better visibility in browser tabs

**Extension Point:** Replace with custom brand logo

---

### PWA Icons

#### pwa-icon-192.png
**Purpose:** Small PWA icon for app installations

**Specs:**
- Size: 192x192 pixels
- PNG format
- Used in app manifests
- Displayed when adding to home screen

#### pwa-icon-512.png
**Purpose:** Large PWA icon for splash screens

**Specs:**
- Size: 512x512 pixels
- PNG format
- High quality for various screen sizes
- Used in splash screens

#### pwa-icon-maskable-192.png
**Purpose:** Small maskable PWA icon

**Specs:**
- Size: 192x192 pixels
- Follows maskable icon spec
- Safe zone in center
- Works with circular, rounded, or square masks

#### pwa-icon-maskable-512.png
**Purpose:** Large maskable PWA icon

**Specs:**
- Size: 512x512 pixels
- Maskable icon format
- Adaptive to different platform icon shapes
- Professional appearance on all devices

**Extension Point:** Replace with custom app icons for branded PWA

---

### templates.png
**Purpose:** Template placeholder or example image

**Usage:** May be used for documentation or example templates

---

## Extension Integration Points

### Custom Login Pages

**Use Case:** Add OAuth login, SSO, or custom authentication

**Approach:**
1. Create new HTML file in `pages/`
2. Add corresponding CSS file
3. Register route in `src/node/routes/login.ts`
4. Add template variable substitution

**Example:**
```typescript
// In login route
app.get('/login/oauth', (req, res) => {
  const html = fs.readFileSync('src/browser/pages/oauth-login.html')
  const rendered = replaceTemplates(html, {
    oauth_providers: ['github', 'google', 'microsoft']
  })
  res.send(rendered)
})
```

---

### Custom Error Pages

**Use Case:** Brand-specific error handling

**Approach:**
1. Create custom error.html template
2. Modify error handler in `src/node/routes/errors.ts`
3. Add custom styling

---

### PWA Customization

**Use Case:** Branded progressive web app

**Steps:**
1. Replace PWA icons in `media/`
2. Update `manifest.json` generation in `src/node/routes/vscode.ts`
3. Customize service worker caching strategy
4. Add app-specific offline capabilities

---

### Custom Themes

**Use Case:** White-label IDE with custom branding

**Approach:**
1. Modify `design-system.css` color variables
2. Update favicon and PWA icons
3. Customize login page branding
4. Add company logo to pages

**Example:**
```css
/* In design-system.css */
:root {
  --color-primary: #your-brand-color;
  --color-secondary: #your-secondary-color;
  --font-family-base: 'Your Font', sans-serif;
}
```

---

## Serving Static Assets

Static files are served via Express static middleware:

**Route:** `/_static/*`

**Configuration:** In `src/node/routes/index.ts`

```typescript
app.router.use('/_static', express.static(rootPath, {
  cacheControl: commit !== "development",
  maxAge: '1y'
}))
```

**Caching:**
- Production: Aggressive caching (1 year)
- Development: No caching

---

## Template Variable System

Templates use `{{VARIABLE}}` syntax for dynamic content.

**Common Variables:**
- `{{BASE}}` - Base path for routing
- `{{CS_STATIC_BASE}}` - Static asset base path
- `{{ERROR}}` - Error messages
- `{{TO}}` - Redirect target
- `{{OPTIONS}}` - JSON configuration object
- `{{I18N_*}}` - Internationalization strings

**Processing:** `replaceTemplates()` function in `src/node/http.ts`

---

## Internationalization (i18n)

Login pages support multiple languages via i18next.

**Supported Languages:**
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Japanese (ja)
- Chinese Simplified (zh-cn)
- And more...

**Translation Files:** `src/node/i18n/locales/`

**Extension Point:** Add custom translations for new languages

---

## Security Considerations

### Content Security Policy

All pages should be served with appropriate CSP headers:

```typescript
// From src/core/security.ts
res.setHeader('Content-Security-Policy',
  "default-src 'self'; script-src 'self' 'unsafe-inline'; ..."
)
```

### CSRF Protection

Forms include CSRF tokens:

```html
<input type="hidden" name="_csrf" value="{{CSRF_TOKEN}}">
```

### XSS Prevention

All template variables are HTML-escaped before rendering.

---

## Best Practices

### Performance

1. **Minimize CSS/JS:** Minify in production builds
2. **Optimize Images:** Compress PNG/SVG files
3. **Use CDN:** Serve static assets via CDN if possible
4. **Lazy Load:** Load non-critical assets asynchronously

### Accessibility

1. **Semantic HTML:** Use proper HTML5 elements
2. **ARIA Labels:** Add ARIA attributes where needed
3. **Keyboard Navigation:** Ensure all interactive elements are keyboard accessible
4. **Color Contrast:** Maintain WCAG AA contrast ratios
5. **Focus Indicators:** Clear focus states

### Maintainability

1. **Use Design System:** Reference design-system.css variables
2. **Component Reuse:** Create reusable CSS classes
3. **Documentation:** Comment complex CSS
4. **Naming Conventions:** Use BEM or consistent naming

---

## Related Files

- **Template Processing:** `src/node/http.ts:replaceTemplates()`
- **Route Registration:** `src/node/routes/index.ts`
- **Login Handler:** `src/node/routes/login.ts`
- **Error Handler:** `src/node/routes/errors.ts`
- **VSCode Route:** `src/node/routes/vscode.ts` (manifest generation)

---

## Future Enhancements

- [ ] Add more OAuth providers to login page
- [ ] Implement remember me functionality
- [ ] Add password strength indicator
- [ ] Create admin dashboard page
- [ ] Add user profile page
- [ ] Implement theme switcher UI
- [ ] Add loading screen between pages
- [ ] Create onboarding tour for new users
