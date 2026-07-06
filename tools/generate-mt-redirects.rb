#!/usr/bin/env ruby
# frozen_string_literal: true

# Generates client-side redirect stubs for Movable Type's old numeric archive
# URLs (/mt/archives/NNNNNN.html), which on the original site were PHP files
# issuing a 301 to the slug-based URL. Cloudflare Pages serves static files
# only (no PHP), and the redirect count here exceeds the Pages `_redirects`
# file's 2,100-rule limit, so each old numeric URL gets its own small stub
# page instead: a <meta refresh>, a JS redirect, and a plain link, covering
# JS-disabled browsers and crawlers as well as normal visitors.
#
# Usage:
#   bundle install --with migration   # if not already done for migrate-mt-to-jekyll.rb
#   bundle exec ruby tools/generate-mt-redirects.rb
#
# SOURCE_BACKUP_DIR should contain the old site's mt/archives/*.html files
# (a full static export/backup of the original site).

require 'mysql2'
require 'fileutils'
require 'json'

BLOG_ID = 1
SOURCE_BACKUP_DIR = '/Users/barry/data/bloggy/mt/archives'
REPO = File.expand_path('..', __dir__)
OUTPUT_DIR = File.join(REPO, 'mt', 'archives')

my_cnf = File.read(File.expand_path('~/.my.cnf'))
db_pass = my_cnf[/password="(.*)"/, 1]
client = Mysql2::Client.new(host: '127.0.0.1', username: 'root', password: db_pass, database: 'movable_type')

def slugify(basename)
  basename.gsub('_', '-')
end

entries = client.query(<<~SQL, cache_rows: false)
  SELECT entry_id, entry_basename, entry_authored_on
  FROM mt_entry
  WHERE entry_blog_id = #{BLOG_ID} AND entry_status = 2 AND entry_class = 'entry'
SQL

id_to_permalink = {}
entries.each do |row|
  slug = slugify(row['entry_basename'].to_s)
  ym = row['entry_authored_on'].strftime('%Y/%m')
  id_to_permalink[row['entry_id']] = "/#{ym}/#{slug}.html"
end

# The MT "page" class isn't part of the post migration (see migrate-mt-to-jekyll.rb),
# but a couple of its entries have old numeric redirect stubs pointing at them.
# Map those by hand to their equivalent on the new site.
id_to_permalink[7131] = '/about/' # old MT "about" page -> Chirpy's built-in About tab

FileUtils.mkdir_p(OUTPUT_DIR)

written = 0
skipped_not_redirect = []
skipped_no_target = []

Dir.glob(File.join(SOURCE_BACKUP_DIR, '*.html')).each do |path|
  basename = File.basename(path)
  next unless basename =~ /\A(\d+)\.html\z/

  id = $1.to_i
  content = File.read(path, encoding: 'ISO-8859-1').encode('UTF-8', invalid: :replace, undef: :replace)

  unless content.start_with?('<?php')
    skipped_not_redirect << basename
    next
  end

  target = id_to_permalink[id]
  unless target
    skipped_no_target << basename
    next
  end

  html = <<~HTML
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=#{target}">
    <link rel="canonical" href="#{target}">
    <title>Redirecting&hellip;</title>
    <script>location.replace(#{target.to_json});</script>
    </head>
    <body>
    <p>This page has moved. If you are not redirected automatically, <a href="#{target}">click here</a>.</p>
    </body>
    </html>
  HTML

  File.write(File.join(OUTPUT_DIR, basename), html)
  written += 1
end

puts "Redirect stubs written: #{written}"
puts "Skipped (not a PHP redirect file, likely a leftover page for a deleted entry): #{skipped_not_redirect.size}"
skipped_not_redirect.each { |f| puts "  #{f}" }
puts "Skipped (redirect file present but entry_id not found in current DB): #{skipped_no_target.size}"
skipped_no_target.each { |f| puts "  #{f}" }
