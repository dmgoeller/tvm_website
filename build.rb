#!/usr/bin/env ruby

require 'cssminify'
require 'net/sftp'
require 'uglifier'
require 'uri'
require 'yaml'

$config = YAML.load_file('./build.yml')
$src_dir = $config.dig('directories', 'src') || 'src'
$build_dir = $config.dig('directories', 'build') || 'build'
$dist_dir = $config.dig('directories', 'dist') || 'dist'

def task(name, &block)
  puts
  puts "#{'-' * 40}"
  puts name
  puts "#{'-' * 40}"
  puts
  yield $config[name.downcase.gsub(' ', '_')] || {}
end

def action(name, &block)
  puts "#{name}"
  yield
end

# utility methods

def load_svg(filename)
  File.readlines(filename)[1..-1].collect(&:strip).join
end

def load_svg_icons(dir)
  (Dir.glob("#{dir}/*.svg").collect { |f| [File.basename(f), load_svg(f)] }).to_h
end

def uri_escape(s) 
  URI.escape(s.gsub('(', '%28').gsub(')', '%29'))
end

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
    icons = options[:icons]
    html = File.read(filename)

    # replace base path
    html.gsub!(/data\-base\-path\s*\=\s*\"(\w|\/)*\"/) { |chunk| 
      "data-base-path=\"#{options[:base_path]}\""
    }
    # embed stylesheets
    html.gsub!(/\<link.*href\=\"assets\/stylesheets\/(\w|\-)*\.css\".*\>/) { |link|
      stylesheet = File.read(link.match(/(\w|\-|\/)*\.css/)[0])
      stylesheet.gsub!(/url\(\'(\w|\-|\/|\.)*\.svg\'\)/) { |chunk|
        icon = icons[chunk.match(/(\w|\-)*\.svg/)[0]]
        "url(data:image/svg+xml,#{uri_escape(icon)})"
      }
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
    # embed icons
    html.gsub!(/\<img(\s*\w*\=\".*\"\s*)*\s*src\=\"(\w|\-|\/)*\.svg\"\>/) { |element|
      icon = icons[element.match(/(\w|\-)*\.svg/)[0]]
      icon.nil? ? element : icon
    }
    # embed thumbnails
    html.gsub!(/\<div\s*class\=\"background\"\s*data-image\=\"(\w|\-|\/)*\.jpg\"/) { |chunk|
      image = File.binread("../thumbs/#{chunk.match(/(\w|\-|\/)*\.jpg/)[0]}")
      svg = options[:blur_svg].gsub('#{base64}', [image].pack('m'))
      "#{chunk} style=\"background-image: url(data:image/svg+xml,#{uri_escape(svg)});\""
    }
    File.write(filename, html)
  end
end

def build_service_worker_standalone_js(options = {})
  action "Build 'service-worker-standalone.js'" do
    service_worker = File.read('service-worker.js');
    service_worker.sub!(/var\s*PAGES_TO_CACHE\s*\=.*\;/) {
      pages = Dir.glob("#{options[:pages_dir]}/*.html").collect() { |page| "'#{page}'" };
      "var PAGES_TO_CACHE = [#{pages.join(',')}];"
    }
    File.write('service-worker-standalone.js', service_worker);
  end
end

def build_htaccess(filename, options = {})
  action "Build '#{filename}'" do
    base_path = options[:base_path]
    htaccess = File.read(filename)
    htaccess << "\n"
    htaccess << "RewriteBase #{base_path[0..-2]}\n" if base_path.length > 1
    Dir.glob("#{options[:pages_dir]}/*.html") { |page|
      htaccess << "RewriteRule ^#{File.basename(page, '.html')}$ index.html [L]\n"
    } 
    File.write(filename, htaccess)
  end
end

# tasks

def prepare
  task 'Prepare' do
    create_or_clean($dist_dir)
  end
end

def build_thumbs
  task 'Build Media' do
    build_dir = "#{$build_dir}/thumbs/media"

    create_or_clean(build_dir)
    copy("#{$src_dir}/media", build_dir)
    system("find #{build_dir} -type f -name '*.jpg' -exec sips -Z 40 {} \\;")
  end
end

def build_app
  task 'Build App' do |config|
    build_dir = "#{$build_dir}/app"
    base_path = config['base_path'] || '/'

    create_or_clean(build_dir)
    copy($src_dir, build_dir, exclude: %w(media download))

    FileUtils.cd(build_dir) do
      icons = load_svg_icons('assets/icons')
      blur_svg = load_svg('assets/templates/blur.svg')

      build_html('index.html', icons: icons, blur_svg: blur_svg, base_path: base_path)

      Dir.glob("pages/*.html") { |filename| 
        action "Build page \'#{filename}\'" do
          build_html(filename, icons: icons, blur_svg: blur_svg, base_path: base_path)
        end
      }
      build_service_worker_standalone_js(pages_dir: 'pages')
      build_htaccess('.htaccess', pages_dir: 'pages', base_path: base_path)
    end

    copy(build_dir, $dist_dir, exclude: %w(assets))
  end
end

def deploy
  task 'Deploy' do |config|
    Net::SFTP.start(config['host'], config['username'], password: config['password']) do |sftp|
      Dir.chdir($dist_dir) do
        Dir.glob('**/*').each do |filename|
          next if File.directory?(filename)
          action "Upload '#{filename}'" do
            sftp.upload!(filename, "#{config['path']}/#{filename}")
          end
        end
        action "Upload '.htaccess'" do
          sftp.upload!('.htaccess', "#{config['path']}/.htaccess")
        end
      end
    end
  end
end

begin
  prepare
  build_thumbs if ARGV.include?('-media')
  build_app
  deploy if ARGV.include?('-deploy')
#rescue Exception => e
#  puts "\nError: #{e.message}"
end

puts
