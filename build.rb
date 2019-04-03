#!/usr/bin/env ruby

require 'optparse'
require 'cssminify'
require 'net/sftp'
require 'uglifier'
require 'uri'
require 'yaml'
require 'fastimage'

$options = {}

OptionParser.new do |opt|
  opt.banner = 'Usage: ruby build.rb [options]'

  opt.on('-e ENVIRONMENT') { |env| $options[:env] = env }
  opt.on('-d', '--deploy') { $options[:deploy] = true }
  opt.on('-m', '--build-media') { $options[:build_media] = true }
end.parse!

# utility methods

def action(name, &block)
  puts "#{name}"
  yield
end

def task(name, &block)
  puts ['', "#{'-' * 40}", name, "#{'-' * 40}", '']
  yield $config[name.downcase.gsub(' ', '_')] || {}
end

def load_svg(filename)
  File.readlines(filename)[1..-1].collect(&:strip).join
end

def uri_escape(s)
  URI.escape(s.gsub('(', '%28').gsub(')', '%29'))
end

def deep_merge(h1, h2)
  h1.dup.tap { |merged|
    h2.each_pair do |key, value|
      if (merged[key].is_a?(Hash) && value.is_a?(Hash))
        merged[key] = deep_merge(merged[key], value)
      else
        merged[key] = value
      end
    end
  }
end

def upload_entries(sftp, local_path, remote_path, options = {})
  remote_entries = {}
  sftp.dir.foreach(remote_path) { |entry| remote_entries[entry.name] = entry }

  Dir.chdir(local_path) do
    Dir.entries('.').each do |filename|
      next if %w(. .. .DS_Store).include?(filename) || options[:exclude]&.match(filename)
      remote_filename = "#{remote_path}/#{filename}"

      if File.directory?(filename)
        sftp.mkdir!(remote_filename) unless remote_entries.include?(filename)
        upload_entries(sftp, filename, remote_filename)
      else
        remote_entry = remote_entries[filename]
        if remote_entry.nil? || remote_entry.attributes.mtime < File.mtime(filename).to_i
          puts "Upload #{remote_filename}"
          sftp.upload!(filename, remote_filename)
        end
      end
    end
  end
end

# configuration

build_yaml = YAML.load_file('./build.yml')

$config = deep_merge(build_yaml['defaults'], build_yaml[$options[:env] || 'test'])
$src_dir = $config.dig('directories', 'src') || 'src'
$build_dir = $config.dig('directories', 'build') || 'build'
$dist_dir = $config.dig('directories', 'dist') || 'dist'

# actions

def create_or_clean(dir)
  if Dir.exist?(dir)
    action "Clean directory '#{dir}'" do
      FileUtils.rm_r(Dir.glob("#{dir}/*"))
    end
  else
    action "Create directory '#{dir}'" do
      FileUtils.mkdir_p(dir)
    end
  end
end

def copy(src, dest, options = {})
  action "Copy files from \'#{src}\' to \'#{dest}\'" do
    FileUtils.copy_entry(src, dest)

    options[:exclude].each do |exclude|
      FileUtils.rm_r("#{dest}/#{exclude}")
    end unless options[:exclude].nil?
  end
end

def build_html(filename, options = {})
  action "Build '#{filename}'" do
    html = File.read(filename)

    # replace base path
    html.gsub!(/data\-base\-path\s*\=\s*\"(\w|\/)*\"/) { |chunk|
      "data-base-path=\"#{options[:base_path]}\""
    }
    # replace robots meta property
    html.gsub!(/\<meta\s+name\=\"robots\"\s+content\=\"(\w|\s)*\"\>/) {
      "<meta name=\"robots\" content=\"#{options[:meta][:robots]}\">"
    } unless options[:meta][:robots].nil?
    # embed stylesheets
    html.gsub!(/\<link.*href\=\"assets\/stylesheets\/(\w|\-)*\.css\".*\>/) { |link|
      stylesheet = File.read(link.match(/(\w|\-|\/)*\.css/)[0])
      stylesheet.gsub!(/url\(\'(\w|\-|\/|\.)*\.svg\'\)/) { |chunk|
        icon = options[:icons][chunk.match(/(\w|\-)*\.svg/)[0]]
        "url(data:image/svg+xml,#{uri_escape(icon)})"
      }
      stylesheet.gsub!('url(../../web-fonts/', 'url(web-fonts/')
      stylesheet = CSSminify.compress(stylesheet)
      "<style>\n#{stylesheet}\n</style>"
    }
    # embed javascripts
    html.gsub!(/\<script.*src\=\"assets\/javascripts\/(\w|\-)*\.js\".*\>/) { |script|
      javascript = File.read(script.match(/(\w|\-|\/)*\.js/)[0])
      javascript = Uglifier.compile(javascript, harmony: true)
      "<script type=\"text/javascript\">\n#{javascript}\n</script>"
    }
    # embed icons
    html.gsub!(/\<img(\s*\w*\=\".*\"\s*)*\s*src\=\"(\w|\-|\/)*\.svg\"(\s*\w*\=\".*\"\s*)*\>/) { |element|
      icon = options[:icons][element.match(/(\w|\-)*\.svg/)[0]]
      icon.nil? ? element : icon
    }
    # embed placeholder images
    html.gsub!(/data-image\=\"(\w|\-|\/)*\.jpg\"\s*data-placeholder-image/) { |chunk|
      placeholder_image = "#{chunk.match(/(\w|\-|\/)*\.jpg/)[0]}".sub('media', '../media/thumbs')
      image_size = FastImage.size(placeholder_image)
      svg = String.new(options[:placeholder_image_template])
      svg.sub!('#{height}', !image_size.nil? ? image_size[1].to_s : '27')
      svg.sub!('#{width}', !image_size.nil? ? image_size[0].to_s : '48')
      svg.sub!('#{base64}', [File.binread(placeholder_image)].pack('m'))
      "#{chunk} style=\"background-image: url(data:image/svg+xml,#{uri_escape(svg)});\""
    }
    File.write(filename, html)
  end
end

def build_htaccess(filename, articles_dir, options = {})
  action "Build '#{filename}'" do
    htaccess = File.read(filename)

    if options[:redirect_http_to_https]
      htaccess << "\n# Redirect http to https\n"
      htaccess << "RewriteCond %\{HTTPS\} !=on\n"
      htaccess << "RewriteRule ^ https://%\{HTTP_HOST\}%\{REQUEST_URI\} [L,R=301]\n"
    end
    if options[:redirect_article_paths_to_index]
      htaccess << "\n# Redirect article paths to index.html\n"
      htaccess << "RewriteBase #{options[:base_path].empty? ? '/' : options[:base_path]}\n"

      Dir.glob("#{articles_dir}/*.html") { |article|
        next if article == options[:index_page]
        htaccess << "RewriteRule ^#{File.basename(article, '.html')}$ index.html [L]\n"
      }
    end
    File.write(filename, htaccess)
  end
end

def build_thumbnail_images(src, dest)
  action 'Build thumbnail images' do
    FileUtils.copy_entry(src, dest)
    system("find #{dest} -type f -name '*.jpg' -exec sips -Z 48 {} \\;", out: :close, err: :close)
  end
end

# tasks

def prepare
  task 'Prepare' do
    create_or_clean($dist_dir)
  end
end

def build_media
  task 'Build Media' do
    build_dir = "#{$build_dir}/media"

    create_or_clean(build_dir)
    build_thumbnail_images("#{$src_dir}/media", "#{build_dir}/thumbs")
  end
end

def build_app
  task 'Build App' do |config|
    build_dir = "#{$build_dir}/app"
    base_path = config['base_path'] || ''
    base_path = base_path[0..-2] if base_path.end_with?('/')

    create_or_clean(build_dir)
    copy($src_dir, build_dir, exclude: %w(download media web-fonts web-icons))

    FileUtils.cd(build_dir) do
      options = {
        redirect_http_to_https: config['redirect_http_to_https'],
        redirect_article_paths_to_index: config['redirect_article_paths_to_index'],
        base_path: base_path,
        icons: (Dir.glob("assets/icons/*.svg").collect { |f| [File.basename(f), load_svg(f)] }).to_h,
        index_page: File.read('index.html').scan(/data\-index\-page\s*\=\s*\"((?:\w|\-)*)\"/).flatten.first,
        meta: { robots: config['meta_robots'] },
        placeholder_image_template: load_svg('assets/templates/placeholder.svg')
      }
      build_html('index.html', options)
      Dir.glob("articles/*.html") { |filename| build_html(filename, options) }
      build_htaccess('.htaccess', 'articles', options)
    end

    copy(build_dir, $dist_dir, exclude: %w(assets))
  end
end

def deploy
  task 'Deploy' do |config|
    Net::SFTP.start(config['host'], config['username'], password: config['password']) do |sftp|
      remote_path = config['path']
      upload_entries(sftp, "#{$dist_dir}", remote_path)
      upload_entries(sftp, "#{$src_dir}/download", "#{remote_path}/download", exclude: /.*\.docx/)
      upload_entries(sftp, "#{$src_dir}/ical", "#{remote_path}/ical")
      upload_entries(sftp, "#{$src_dir}/media", "#{remote_path}/media")
      upload_entries(sftp, "#{$src_dir}/web-fonts", "#{remote_path}/web-fonts")
      upload_entries(sftp, "#{$src_dir}/web-icons", "#{remote_path}/web-icons")
    end
  end
end

begin
  prepare
  build_media if $options[:build_media] == true
  build_app
  deploy if $options[:deploy] == true
#rescue StandardError => e
#  puts "\nError: #{e.message}"
end

puts
