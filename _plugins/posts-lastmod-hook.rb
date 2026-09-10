#!/usr/bin/env ruby
#
# Set `last_modified_at` on posts that have been edited since they were first
# committed, so Chirpy can show an "Updated" date.
#
# The obvious implementation asks git about each post individually, which
# spawns two subprocesses per post. At this corpus size (~2,700 posts) that
# dominated the build: 113s total, of which ~51s was this hook, and it cost
# the same ~51s even when building a handful of pages, which made the local
# tweak loop unusably slow. Walking the whole history once instead costs a
# single git invocation, and leaves the result unchanged.

module PostsLastmod
  # Prefixes the date line so it can't be confused with a file path.
  MARKER = '@@lastmod@@'

  # Repo-relative path => date of the most recent commit touching it, but only
  # for paths with more than one commit (matching the previous behaviour of
  # setting `last_modified_at` only on posts that were edited after creation).
  def self.build_table(source)
    root = `git -C "#{source}" rev-parse --show-toplevel 2>/dev/null`.strip
    return {} if root.empty?

    log = `git -C "#{root}" log --pretty=format:"#{MARKER}%ad" --date=iso --name-only 2>/dev/null`
    return {} if log.empty?

    counts = Hash.new(0)
    latest = {}
    date = nil

    # git lists commits newest-first, so the first date seen for a path is its
    # most recent modification.
    log.each_line do |line|
      line = line.chomp
      next if line.empty?

      if line.start_with?(MARKER)
        date = line[MARKER.length..]
      else
        counts[line] += 1
        latest[line] ||= date
      end
    end

    latest.select { |path, _| counts[path] > 1 }
  end

  def self.table(site)
    @table ||= build_table(site.source)
  end

  # `post.path` is absolute; the table is keyed by repo-relative paths.
  def self.relative_to_repo(path, source)
    @root ||= `git -C "#{source}" rev-parse --show-toplevel 2>/dev/null`.strip
    return path if @root.empty?

    prefix = "#{@root}/"
    path.start_with?(prefix) ? path[prefix.length..] : path
  end
end

Jekyll::Hooks.register :posts, :post_init do |post|
  table = PostsLastmod.table(post.site)
  key = PostsLastmod.relative_to_repo(post.path, post.site.source)
  lastmod = table[key]
  post.data['last_modified_at'] = lastmod if lastmod
end
