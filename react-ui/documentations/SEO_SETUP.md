# SEO Setup Guide for Google Search

This guide explains how to configure your website for optimal Google search visibility.

## 📋 What's Been Set Up

1. **sitemap.xml** - Tells search engines about your website structure
2. **robots.txt** - Updated to reference the sitemap
3. **Enhanced Meta Tags** - Open Graph, Twitter Cards, and SEO meta tags
4. **Structured Data (JSON-LD)** - Helps Google understand your content better

## 🔧 Required Configuration Steps

### Step 1: Update Your Domain URL

**IMPORTANT:** Replace `https://yourdomain.com` with your actual website URL in the following files:

1. **public/sitemap.xml**
   - Replace `https://yourdomain.com/` with your actual domain
   - Update `<lastmod>` date to today's date (format: YYYY-MM-DD)

2. **public/robots.txt**
   - Replace `https://yourdomain.com/sitemap.xml` with your actual sitemap URL

3. **public/index.html**
   - Replace all instances of `https://yourdomain.com/` with your actual domain
   - Update in: `og:url`, `twitter:url`, `canonical`, and JSON-LD structured data

4. **public/index.template.ejs**
   - Replace all instances of `https://yourdomain.com/` with your actual domain
   - Same locations as index.html

### Step 2: Customize Meta Tags (Optional)

Update the following in both `index.html` and `index.template.ejs`:

- **Description**: Update the meta description to accurately describe your website
- **Keywords**: Add relevant keywords for your power flow analysis tool
- **Open Graph Image**: Ensure `logo.svg` is a good representation, or replace with a custom image
- **Structured Data**: Update the JSON-LD schema with accurate information about your application

### Step 3: Submit to Google Search Console

1. **Create a Google Search Console account** (if you don't have one)
   - Go to https://search.google.com/search-console
   - Add your property (website URL)

2. **Verify ownership** using one of these methods:
   - HTML file upload
   - HTML tag
   - DNS record
   - Google Analytics

3. **Submit your sitemap**:
   - Go to "Sitemaps" in the left menu
   - Enter: `https://yourdomain.com/sitemap.xml`
   - Click "Submit"

4. **Request indexing** (optional but recommended):
   - Use "URL Inspection" tool
   - Enter your homepage URL
   - Click "Request Indexing"

### Step 4: Test Your Setup

1. **Validate sitemap.xml**:
   - Use Google Search Console's sitemap validator
   - Or use online tools like: https://www.xml-sitemaps.com/validate-xml-sitemap.html

2. **Test robots.txt**:
   - Visit: `https://yourdomain.com/robots.txt`
   - Verify it's accessible and shows the sitemap reference

3. **Check meta tags**:
   - Use Facebook's Sharing Debugger: https://developers.facebook.com/tools/debug/
   - Use Twitter's Card Validator: https://cards-dev.twitter.com/validator
   - Use Google's Rich Results Test: https://search.google.com/test/rich-results

## 📊 Additional SEO Best Practices

### Content Optimization

1. **Use descriptive titles and headings** (H1, H2, H3)
2. **Add alt text to images** for better accessibility and SEO
3. **Create quality, original content** about power flow analysis
4. **Use internal linking** between related pages/sections

### Technical SEO

1. **Ensure fast page load times**:
   - Optimize images
   - Minimize JavaScript and CSS
   - Use CDN if possible

2. **Mobile-friendly design**:
   - Your viewport meta tag is already set
   - Test on mobile devices

3. **HTTPS**:
   - Ensure your site uses HTTPS (required for modern SEO)

4. **Clean URLs**:
   - Use descriptive, readable URLs
   - Avoid unnecessary parameters

### Analytics & Monitoring

1. **Set up Google Analytics** (optional but recommended):
   - Track visitor behavior
   - Monitor search performance

2. **Monitor Search Console**:
   - Check for crawl errors
   - Monitor search performance
   - Review indexing status

## 🔄 Updating Your Sitemap

If you add new pages or routes to your application:

1. Add new `<url>` entries to `sitemap.xml`
2. Update the `<lastmod>` date for changed pages
3. Resubmit the sitemap in Google Search Console

Example:
```xml
<url>
  <loc>https://yourdomain.com/about</loc>
  <lastmod>2024-01-15</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

## 📝 Priority Levels

- **1.0**: Homepage (highest priority)
- **0.8**: Important pages (About, Features, etc.)
- **0.6**: Secondary pages
- **0.4**: Less important pages

## 🔍 Change Frequency

- **always**: Pages that change with every access
- **hourly**: Pages that change hourly
- **daily**: Pages that change daily
- **weekly**: Pages that change weekly
- **monthly**: Pages that change monthly
- **yearly**: Pages that change yearly
- **never**: Archived pages

## ⚠️ Important Notes

1. **Don't include duplicate content** in your sitemap
2. **Keep sitemap under 50MB** and 50,000 URLs (for larger sites, use sitemap index)
3. **Update lastmod dates** when content changes significantly
4. **Test before deploying** to production

## 🚀 Quick Checklist

- [ ] Replace `https://yourdomain.com` with your actual domain in all files
- [ ] Update `<lastmod>` date in sitemap.xml
- [ ] Customize meta descriptions and keywords
- [ ] Verify sitemap.xml is accessible at `/sitemap.xml`
- [ ] Verify robots.txt is accessible at `/robots.txt`
- [ ] Submit sitemap to Google Search Console
- [ ] Test meta tags with Facebook/Twitter validators
- [ ] Request indexing in Google Search Console

## 📚 Additional Resources

- [Google Search Central](https://developers.google.com/search)
- [Sitemap Protocol](https://www.sitemaps.org/protocol.html)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Schema.org](https://schema.org/) - For structured data

---

**Need help?** Check Google Search Console's help documentation or SEO best practices guides.

