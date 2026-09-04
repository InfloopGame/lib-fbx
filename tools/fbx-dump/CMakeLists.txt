cmake_minimum_required(VERSION 3.15)
project(fbx-dump LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(FBX_SDK_ROOT "D:/Tools/FBX SDK/2020.2.1" CACHE PATH "Autodesk FBX SDK 2020.2.1 root")
set(FBX_LIB_DIR "${FBX_SDK_ROOT}/lib/vs2019/x64/release")

add_executable(fbx-dump src/main.cpp)
target_include_directories(fbx-dump PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${FBX_SDK_ROOT}/include"
)
target_compile_definitions(fbx-dump PRIVATE
    _CRT_SECURE_NO_WARNINGS
    NOMINMAX
)

if(MSVC)
    target_compile_options(fbx-dump PRIVATE /utf-8 /EHsc /bigobj /W3)
    set_property(TARGET fbx-dump PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")
endif()

target_link_libraries(fbx-dump PRIVATE
    "${FBX_LIB_DIR}/libfbxsdk-md.lib"
    "${FBX_LIB_DIR}/libxml2-md.lib"
    "${FBX_LIB_DIR}/zlib-md.lib"
)

if(WIN32)
    target_link_libraries(fbx-dump PRIVATE advapi32)
endif()
