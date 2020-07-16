#!/usr/bin/env ruby

require 'optparse'
require 'cssminify'
require 'net/ftp'
require 'uglifier'
require 'uri'
require 'yaml'
require 'fastimage'
require 'nokogiri'
require 'securerandom'

$environment = 'test'
$options = {}

OptionParser.new do |opt|
  opt.banner = 'Usage: ruby build.rb [options]'

  opt.on('-e ENVIRONMENT') { |environment| $environment = environment }
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

def article_names(articles_dir)
  Dir.glob("#{articles_dir}/*.html").map { |filename| File.basename(filename, '.html') }
end

def load_svg(filename)
  File.readlines(filename).collect(&:strip).join
end

def uri_escape(s)
  URI.escape(s.gsub('(', '%28').gsub(')', '%29'))
end

def hex_to_rgba(hex)
  decimals = [1, 3, 5, 7].map { |i| hex[i..(i+1)].to_i(16) }
  decimals[3] = (decimals[3]).to_f / 256 # alpha
  "rgba(#{decimals.join(',')})"
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

def convert_images(src, dest, options)
  FileUtils.mkdir_p(dest) unless File.exists?(dest)

  Dir.glob("#{src}/*") do |src_filename|
    dest_filename = "#{dest}/#{File.basename(src_filename)}"

    if File.directory?(src_filename)
      convert_images(src_filename, dest_filename, options)
    elsif src_filename.end_with?('.jpg')
      system("convert #{options} #{src_filename} #{dest_filename}", out: :close, err: :close)
    end
  end
end

def ftp_upload(ftp, local_dir, remote_dir, options = {})
  exclude = options[:exclude]

  Dir.chdir(local_dir) do
    remote_dir_before = ftp.pwd
    ftp.chdir(remote_dir)
    remote_filenames = ftp.nlst.map { |filename| filename }

    Dir.entries('.').each do |filename|
      next if %w(. .. .DS_Store).include?(filename) || exclude&.match(filename)

      if File.directory?(filename)
        ftp.mkdir(filename) unless remote_filenames.include?(filename)
        ftp_upload(ftp, filename, filename, options)
      else
        next if remote_filenames.include?(filename) && ftp.mtime(filename) >= File.mtime(filename)
        puts "Upload #{remote_dir}/#{filename}"
        ftp.putbinaryfile(filename)
      end
    end
    ftp.chdir(remote_dir_before)
  end
end

# configuration

build_yaml = YAML.load_file('./build.yml')
$config = deep_merge(build_yaml['defaults'], build_yaml[$environment])

# directories

$src_dir = $config.dig('directories', 'src') || 'src'
$build_dir = $config.dig('directories', 'build') || 'build'
$tmp_dir = "#{$build_dir}/tmp"
$dest_dir = "#{$build_dir}/#{$environment}"

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
    html.gsub!(/data\-app\-base\-path\s*\=\s*\"(\w|\/)*\"/) { |chunk|
      "data-app-base-path=\"#{options[:base_path]}\""
    }
    # replace canonical path
    html.gsub!(/data\-app\-canonical\-path\s*\=\s*\"(\w|\/)*\"/) { |chunk|
      "data-app-canonical-path=\"#{options[:canonical_path]}\""
    }
    # replace robots meta property
    html.gsub!(/\<meta\s+name\=\"robots\"\s+content\=\"(\w|\s)*\"\>/) {
      "<meta name=\"robots\" content=\"#{options[:meta_robots]}\">"
    } unless options[:meta_robots].nil?
    # embed stylesheets
    html.gsub!(/\<link.*href\=\"assets\/stylesheets\/(\w|\-)*\.css\".*\>/) { |link|
      stylesheet = File.read(link.match(/(\w|\-|\/)*\.css/)[0])
      stylesheet.gsub!(/#[0-9a-fA-F]{8}/) { |color| hex_to_rgba(color) }
      stylesheet.gsub!('url(../../fonts/', 'url(fonts/')
      stylesheet = CSSminify.compress(stylesheet)
      "<style>\n#{stylesheet}\n</style>"
    }
    # embed javascripts
    html.gsub!(/\<script.*src\=\"assets\/javascripts\/(\w|\-)*\.js\".*\>/) { |script|
      javascript = File.read(script.match(/(\w|\-|\/)*\.js/)[0])
      javascript = Uglifier.compile(javascript, harmony: true)
      "<script type=\"text/javascript\">\n#{javascript}\n</script>"
    }
    # embed placeholder images
    html.gsub!(/data-image\=\"(\w|\-|\/)*\.jpg\"\s*data-placeholder-image/) { |chunk|
      placeholder_image = "#{chunk.match(/(\w|\-|\/)*\.jpg/)[0]}".sub('media', '../thumbs')
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

def build_service_worker_js(article_dir, options = {})
  action "Build 'service-worker.js'" do
    service_worker_js = File.read('service-worker.js')

    service_worker_js.gsub!(/ARTICLES_TO_CACHE\s\=\s\[.*\]/) {
      articles = article_names(article_dir).map { |article| "'articles/#{article}.html'"}
      "ARTICLES_TO_CACHE = [#{articles.join(',')}]"
    }
    File.write('service-worker.js', service_worker_js)
  end
end

def build_robots_txt(options = {})
  action "Build 'robots.txt'" do
    robots_txt = "User-agent: *\nDisallow: /index.php\nDisallow: /images/\n\n"
    robots_txt << "Sitemap: #{options[:canonical_path]}/sitemap.xml"
    File.write('robots.txt', robots_txt)
  end
end

def build_sitemap_xml(articles_dir, options = {})
  action "Build 'sitemap.xml'" do
    lastmod = Time.now.strftime('%Y-%m-%d')
    File.write('sitemap.xml', Nokogiri::XML::Builder.new { |xml|
      xml.urlset xmlns: 'http://www.sitemaps.org/schemas/sitemap/0.9' do
        article_names(articles_dir).each do |article_name|
          article_name = '' if article_name == options[:index_page]
          xml.url do
            xml.loc "#{options[:canonical_path]}/#{article_name}"
            xml.lastmod lastmod
          end
        end
      end
    }.to_xml )
  end
end

def build_htaccess(articles_dir, options = {})
  action "Build '.htaccess'" do
    #htaccess = File.read('.htaccess')
    htaccess = "RewriteEngine On\n\n"

    htaccess << "\# Security Headers\n"
    htaccess << "Header set Content-Security-Policy \"default-src 'self' img-src 'self' data:;"
    htaccess << "script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline';\"\n"
    htaccess << "Header set Referrer-Policy no-referrer\n"
    htaccess << "Header set X-Content-Type-Options nosniff\n"
    htaccess << "Header set X-Frame-Options deny\n\n"

    htaccess << "\# MIME Types\n"
    htaccess << "AddType text/calendar .ics\n\n"

    htaccess << "\# Caching\n"
    htaccess << "<filesMatch \"\\.(jpg|png|ico|woff|woff2|ttf)$\">\n"
    htaccess << "Header set Cache-Control \"max-age=2592000, public\"\n"
    htaccess << "</filesMatch>\n\n"

    if options[:redirect_http_to_https]
      htaccess << "\# Redirect http to https\n"
      htaccess << "RewriteCond %{HTTPS} !=on\n"
      htaccess << "RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]\n\n"

      #htaccess << "\# Redirect www to non-www\n"
      #htaccess << "RewriteCond %{HTTP_HOST} ^www\\.(.*)$ [NC]\n"
      #htaccess << "RewriteRule ^(.*)$ https://%1/a/$1 [L,R=301]\n\n"
    end

    htaccess << "\# Pages\n"
    htaccess << "RewriteBase #{options[:base_path].empty? ? '/' : options[:base_path]}\n"
    htaccess << "RewriteRule ^index.php index.html [L,R=301]\n"

    article_names(articles_dir).each do |article_name|
      htaccess << "RewriteRule ^#{article_name}$ index.html [L]\n" unless article_name == options[:index_page]
    end

    htaccess << "\n\# Error Pages\n"
    Dir.glob('*.html').grep(/\d{3}\.html/) { |filename|
      htaccess << "ErrorDocument #{filename[0, 3]} /#{filename}\n"
    }
    File.write('.htaccess', htaccess)
  end
end

def build_thumbnail_images(src, dest)
  action 'Build thumbnail images' do
    convert_images(src, dest, "-thumbnail 48")
    #FileUtils.copy_entry(src, dest)
    #system("find #{dest} -type f -name '*.jpg' -exec sips -Z 48 {} \\;", out: :close, err: :close)
  end
end

# tasks

def prepare
  task 'Prepare' do
    create_or_clean($dest_dir)
  end
end

def build_media
  task 'Build Media' do
    dest_dir = "#{$tmp_dir}/thumbs"
    create_or_clean(dest_dir)
    build_thumbnail_images("#{$src_dir}/media", "#{dest_dir}")
  end
end

def build_app
  task 'Build App' do |config|
    build_dir = "#{$tmp_dir}/app"
    base_path = config['base_path'] || ''
    base_path = base_path[0..-2] if base_path.end_with?('/')

    create_or_clean(build_dir)
    copy($src_dir, build_dir, exclude: %w(download fonts ical media webapp))

    FileUtils.cd(build_dir) do
      options = {
        redirect_http_to_https: config['redirect_http_to_https'],
        base_path: base_path,
        canonical_path: config['canonical_path'],
        icons: (Dir.glob('assets/icons/*.svg').collect { |f| [File.basename(f), load_svg(f)] }).to_h,
        index_page: File.read('index.html').scan(/data\-app\-index\-page\s*\=\s*\"((?:\w|\-)*)\"/).flatten.first,
        placeholder_image_template: load_svg('assets/templates/placeholder.svg')
      }
      build_html('index.html', options.merge( { meta_robots: config['meta_robots'] } ))
      Dir.glob('*.html').grep(/\d{3}\.html/) { |filename| build_html(filename, options) }
      Dir.glob('articles/*.html') { |filename| build_html(filename, options) }
      build_service_worker_js('articles', options)
      build_robots_txt(options)
      build_sitemap_xml('articles', options)
      build_htaccess('articles', options)
    end

    copy(build_dir, $dest_dir, exclude: %w(assets))
  end
end

def deploy
  task 'Deploy' do |config|
    Net::FTP.open(config['host'], config['username'], config['password']) do |ftp|
      ftp.chdir(config['remote_dir'])
      ftp_upload(ftp, "#{$dest_dir}", '.')
      ftp_upload(ftp, "#{$src_dir}/download", 'download', exclude: /.*\.docx/)
      ftp_upload(ftp, "#{$src_dir}/ical", 'ical')
      ftp_upload(ftp, "#{$src_dir}/media", 'media')
      ftp_upload(ftp, "#{$src_dir}/fonts", 'fonts')
      ftp_upload(ftp, "#{$src_dir}/webapp", 'webapp')
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
